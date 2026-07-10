// src/app/api/hr/timesheet/route.ts
// GET /api/hr/timesheet — company timesheets
// - HR/Admin: every timesheet in the company (unchanged).
// - Supervisor: only timesheets currently assigned to them for approval —
//   previously this endpoint was HR/Admin-only, so a supervisor visiting
//   "รออนุมัติ Timesheet" always got 403'd and saw an empty list even
//   though their reports' submitted timesheets were waiting on them
//   (current_approver_id was set correctly the whole time — see
//   POST /api/timesheet/:id/submit — this endpoint just never let
//   supervisors query it).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  const isSupervisor = session.role === 'supervisor'
  if (!isHROrAdmin(session) && !isSupervisor) return forbidden()

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
      id, year, month, status, total_hours, submitted_at, approved_at, current_approver_id,
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
  if (isSupervisor) query = query.eq('current_approver_id', session.id)

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ timesheets: data ?? [], total: count ?? 0, page, per_page: limit })
}
