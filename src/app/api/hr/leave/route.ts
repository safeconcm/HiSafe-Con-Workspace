// src/app/api/hr/leave/route.ts
// GET /api/hr/leave — HR/Admin view of ALL company leave requests
// Used by: hr/dashboard, hr/leave page, hr/reports

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
  const status     = searchParams.get('status')
  const leave_type = searchParams.get('leave_type')
  const year       = searchParams.get('year')
  const user_id    = searchParams.get('user_id')
  const dept       = searchParams.get('department')
  const page       = parseInt(searchParams.get('page')  ?? '1')
  const limit      = parseInt(searchParams.get('limit') ?? '30')
  const from       = (page - 1) * limit

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(
        id, employee_code, first_name_th, last_name_th,
        department, position_th, company_id
      ),
      approved_by:users!leave_requests_approved_by_id_fkey(
        first_name_th, last_name_th
      )
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (status)     query = query.eq('status', status)
  if (leave_type) query = query.eq('leave_type', leave_type)
  if (user_id)    query = query.eq('user_id', user_id)
  if (year) {
    query = query
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)
  }

  const { data, count, error } = await query
  if (error) return serverError(error)

  // Filter by department (post-query since it's in user join)
  const requests = dept
    ? (data ?? []).filter((r: any) => r.user?.department === dept)
    : (data ?? [])

  return ok({
    requests,
    total: count ?? 0,
    page,
    per_page: limit,
  })
}
