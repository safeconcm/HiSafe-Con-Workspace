// src/app/api/hr/reports/route.ts
// GET /api/hr/reports?type=leave_summary|heatmap|dept_summary|timesheet_summary&year=2026

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const type  = searchParams.get('type')
  const year  = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null

  if (!type) return badRequest('type required')

  const supabase = createAdminSupabaseClient()

  // ── 1. Leave summary by type and month ─────────────────────
  if (type === 'leave_summary') {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('leave_type, total_days, start_date, status')
      .eq('company_id', session.company_id)
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)

    if (error) return serverError(error)

    // Group by month + leave_type
    const monthlyData: Record<number, Record<string, number>> = {}
    for (let m = 1; m <= 12; m++) monthlyData[m] = {}

    ;(data ?? []).forEach((r: any) => {
      const m = parseInt(r.start_date.split('-')[1])
      if (!monthlyData[m][r.leave_type]) monthlyData[m][r.leave_type] = 0
      monthlyData[m][r.leave_type] += r.total_days
    })

    const chartData = Object.entries(monthlyData).map(([m, types]) => ({
      month: parseInt(m),
      ...types,
      total: Object.values(types).reduce((s, v) => s + v, 0),
    }))

    return ok({ type, year, data: chartData })
  }

  // ── 2. Leave heatmap — days off per employee per month ─────
  if (type === 'heatmap') {
    const { data: leaves, error } = await supabase
      .from('leave_requests')
      .select(`
        user_id, total_days, start_date, leave_type,
        user:users!leave_requests_user_id_fkey(
          first_name_th, last_name_th, department, employee_code
        )
      `)
      .eq('company_id', session.company_id)
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)

    if (error) return serverError(error)

    // Build: { userId: { name, dept, months: [0..11] } }
    const userMap: Record<string, any> = {}
    ;(leaves ?? []).forEach((r: any) => {
      if (!userMap[r.user_id]) {
        userMap[r.user_id] = {
          user_id:  r.user_id,
          name:     `${r.user?.first_name_th} ${r.user?.last_name_th}`,
          emp_code: r.user?.employee_code,
          dept:     r.user?.department ?? '—',
          months:   Array(12).fill(0),
        }
      }
      const m = parseInt(r.start_date.split('-')[1]) - 1
      userMap[r.user_id].months[m] += r.total_days
    })

    return ok({ type, year, data: Object.values(userMap) })
  }

  // ── 3. Department leave summary ────────────────────────────
  if (type === 'dept_summary') {
    const { data: leaves, error } = await supabase
      .from('leave_requests')
      .select(`
        leave_type, total_days,
        user:users!leave_requests_user_id_fkey(department)
      `)
      .eq('company_id', session.company_id)
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)

    if (error) return serverError(error)

    const deptMap: Record<string, Record<string, number>> = {}
    ;(leaves ?? []).forEach((r: any) => {
      const dept = r.user?.department ?? 'ไม่ระบุ'
      if (!deptMap[dept]) deptMap[dept] = { annual: 0, sick: 0, personal: 0, maternity: 0, other: 0, total: 0 }
      deptMap[dept][r.leave_type] = (deptMap[dept][r.leave_type] ?? 0) + r.total_days
      deptMap[dept].total += r.total_days
    })

    const data = Object.entries(deptMap)
      .map(([dept, vals]) => ({ dept, ...vals }))
      .sort((a: any, b: any) => b.total - a.total)

    return ok({ type, year, data })
  }

  // ── 4. Timesheet hours summary by month ───────────────────
  if (type === 'timesheet_summary') {
    const { data, error } = await supabase
      .from('timesheets')
      .select(`
        month, total_hours, status,
        user:users!timesheets_user_id_fkey(department)
      `)
      .eq('company_id', session.company_id)
      .eq('year', year)
      .eq('status', 'approved')

    if (error) return serverError(error)

    const monthMap: Record<number, { total_hours: number; count: number }> = {}
    for (let m = 1; m <= 12; m++) monthMap[m] = { total_hours: 0, count: 0 }

    ;(data ?? []).forEach((r: any) => {
      monthMap[r.month].total_hours += r.total_hours
      monthMap[r.month].count++
    })

    const chartData = Object.entries(monthMap).map(([m, v]) => ({
      month: parseInt(m),
      total_hours: v.total_hours,
      avg_hours: v.count > 0 ? Math.round(v.total_hours / v.count) : 0,
      employee_count: v.count,
    }))

    return ok({ type, year, data: chartData })
  }

  return badRequest(`Unknown report type: ${type}`)
}
