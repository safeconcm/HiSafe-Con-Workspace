// src/app/api/hr/holidays/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const year = new URL(req.url).searchParams.get('year') ?? String(new Date().getFullYear())
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .eq('company_id', session.company_id)
    .eq('year', Number(year))
    .eq('is_active', true)
    .order('holiday_date')

  if (error) return serverError(error)
  return ok({ holidays: data ?? [], year: Number(year) })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body?.holiday_date || !body?.name_th) return badRequest('holiday_date and name_th required')

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('holidays')
    .insert({
      company_id:   session.company_id,
      holiday_date: body.holiday_date,
      name_th:      body.name_th,
      name_en:      body.name_en ?? null,
      type:         body.type ?? 'national',
      created_by:   session.id,
    })
    .select().single()

  if (error) return serverError(error)
  await writeAuditLog({ session, action: 'holiday.created', entity_type: 'holiday', entity_id: data.id, new_data: data, req })
  return created(data)
}
