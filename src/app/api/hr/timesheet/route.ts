// src/app/api/hr/timesheet/route.ts
// GET /api/hr/timesheet — all company timesheets (HR only)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year   = searchParams.get('year')  ?? String(new Date().getFullYear())
  const month  = searchParams.get('month')
  const status = searchParams.get('status')
  const page   = parseInt(searchParams.get('page')  ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '30')
  const from   = (page - 1) * limit

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('timesheets')
    .select(`
      id, year, month, status, total_hours, submitted_at, approved_at,
      user:users!timesheets_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, department, position_th
      )
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .eq('year', parseInt(year))
    .order('year',  { ascending: false })
    .order('month', { ascending: false })
    .range(from, from + limit - 1)

  if (month)  query = query.eq('month', parseInt(month))
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ timesheets: data ?? [], total: count ?? 0, page, per_page: limit })
}
