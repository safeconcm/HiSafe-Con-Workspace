// src/app/api/hr/work-schedule/overrides/route.ts
// POST /api/hr/work-schedule/overrides — HR marks one specific date as
// deviating from the company's normal weekly pattern (e.g. "this Saturday
// IS a working day" for Safecon, whose default weekly pattern has Saturday
// off). Per the chosen design, this is always a specific date HR picks —
// there's no alternating-Saturday formula to compute.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  const { override_date, is_working_day, note } = body
  if (!override_date) return badRequest('override_date required')
  if (typeof is_working_day !== 'boolean') return badRequest('is_working_day must be boolean')

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('company_workday_overrides')
    .upsert({
      company_id: session.company_id, override_date, is_working_day,
      note: note ?? null, created_by: session.id,
    }, { onConflict: 'company_id,override_date' })
    .select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'work_schedule.override_set', entity_type: 'company_workday_override',
    entity_id: data.id, new_data: data, req,
  })
  return created(data)
}
