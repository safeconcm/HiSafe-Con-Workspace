// src/app/api/hr/work-schedule/route.ts
// GET   — the company's weekly work-day pattern + upcoming date overrides
// PATCH — update one weekday's default (is this weekday normally a working
//         day for this company?)
//
// See src/lib/work-schedule.ts for how these two tables (weekly pattern +
// specific-date overrides) combine into "is this date a working day".

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, serverError,
  writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  const [{ data: schedule, error: schedErr }, { data: overrides, error: ovErr }] = await Promise.all([
    supabase.from('company_work_schedules')
      .select('weekday, is_working_day')
      .eq('company_id', session.company_id)
      .order('weekday'),
    supabase.from('company_workday_overrides')
      .select('id, override_date, is_working_day, note')
      .eq('company_id', session.company_id)
      // Only show overrides from the last 30 days onward — past overrides
      // from months ago just clutter the settings page (the actual PDF/
      // Excel exports for past months still read them fine either way).
      .gte('override_date', new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0])
      .order('override_date'),
  ])
  if (schedErr) return serverError(schedErr)
  if (ovErr)    return serverError(ovErr)

  return ok({ schedule: schedule ?? [], overrides: overrides ?? [] })
}

export async function PATCH(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  const { weekday, is_working_day } = body
  if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) return badRequest('weekday must be 0-6')
  if (typeof is_working_day !== 'boolean') return badRequest('is_working_day must be boolean')

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('company_work_schedules').select('*')
    .eq('company_id', session.company_id).eq('weekday', weekday).maybeSingle()

  const { data, error } = await supabase
    .from('company_work_schedules')
    .upsert({
      company_id: session.company_id, weekday, is_working_day,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,weekday' })
    .select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'work_schedule.updated', entity_type: 'company_work_schedule',
    entity_id: data.id, old_data: existing ?? null, new_data: data, req,
  })
  return ok(data)
}
