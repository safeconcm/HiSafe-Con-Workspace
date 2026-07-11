// src/app/api/hr/reports/route.ts
// GET /api/hr/reports?type=leave_summary|heatmap|dept_summary|timesheet_summary|exec_summary&year=2026

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'
import { computePayroll, countCompanyWorkDays, daysInMonth, getUserRate } from '@/lib/payroll'

// Standard Thai OT multipliers applied to the employee's derived hourly
// rate (see getUserRate in payroll.ts) — this is an estimate for the
// executive dashboard, not a payroll-run figure: actual OT payout is
// still whatever HR processes manually, since ot_requests has no rate
// field of its own. weekday = 1.5x normal hourly rate (OT on a working
// day); weekend/holiday = 3x (OT on a day off / public holiday), per the
// common convention under Thai labor law.
const OT_MULTIPLIER: Record<string, number> = { weekday: 1.5, weekend: 3, holiday: 3 }

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

  // ── 5. Executive summary — sick-leave rate, OT cost, labor cost trend ──
  // Consolidates figures that otherwise live on three separate pages
  // (payroll, leave, OT) into one monthly trend for the year.
  if (type === 'exec_summary') {
    // Active headcount — used as the sick-rate denominator. This is a
    // present-day snapshot (not reconstructed per-month historically),
    // same simplification the rest of the HR reports already make.
    const { count: headcount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', session.company_id)
      .eq('status', 'active')

    // Sick leave days, approved, grouped by month
    const { data: sickLeaves, error: sickErr } = await supabase
      .from('leave_requests')
      .select('total_days, start_date')
      .eq('company_id', session.company_id)
      .eq('status', 'approved')
      .eq('leave_type', 'sick')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)
    if (sickErr) return serverError(sickErr)

    const sickByMonth: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) sickByMonth[m] = 0
    for (const r of sickLeaves ?? []) {
      const m = parseInt(r.start_date.split('-')[1])
      sickByMonth[m] += Number(r.total_days)
    }

    // Approved OT requests for the year, joined with user_id so we can
    // resolve each request's hourly rate for its month.
    const { data: otRequests, error: otErr } = await supabase
      .from('ot_requests')
      .select('user_id, ot_date, ot_type, total_hours')
      .eq('company_id', session.company_id)
      .eq('status', 'approved')
      .gte('ot_date', `${year}-01-01`)
      .lte('ot_date', `${year}-12-31`)
    if (otErr) return serverError(otErr)

    const otByMonth: Record<number, { hours: number; cost: number }> = {}
    for (let m = 1; m <= 12; m++) otByMonth[m] = { hours: 0, cost: 0 }

    // Cache rate lookups per user+month so repeated OT requests by the
    // same person in the same month don't re-query salary/contract rows.
    const rateCache = new Map<string, { hourly_rate: number }>()
    for (const r of otRequests ?? []) {
      const m = parseInt(r.ot_date.split('-')[1])
      const monthEnd = `${year}-${String(m).padStart(2, '0')}-${String(daysInMonth(year, m)).padStart(2, '0')}`
      const cacheKey = `${r.user_id}-${m}`
      let rate = rateCache.get(cacheKey)
      if (!rate) {
        const workDays = await countCompanyWorkDays(supabase, session.company_id, year, m)
        rate = await getUserRate(supabase, r.user_id, monthEnd, workDays)
        rateCache.set(cacheKey, rate)
      }
      const multiplier = OT_MULTIPLIER[r.ot_type] ?? 1.5
      const hours = Number(r.total_hours)
      otByMonth[m].hours += hours
      otByMonth[m].cost += Math.round(hours * rate.hourly_rate * multiplier * 100) / 100
    }

    // Base labor cost (approved-timesheet wages) per month via the same
    // computePayroll() used by the /payroll screen — no separate formula.
    const chartData = []
    for (let m = 1; m <= 12; m++) {
      const workDays = await countCompanyWorkDays(supabase, session.company_id, year, m)
      const sickDays = sickByMonth[m]
      const sickRatePct = (headcount && workDays > 0)
        ? Math.round((sickDays / (headcount * workDays)) * 1000) / 10
        : 0

      let laborBaseCost = 0
      // Only compute payroll for months up to the current month of the
      // current year (or all 12 for past years) — avoids doing 12x
      // per-user DB work for future months that can have no timesheets yet.
      const now = new Date()
      const isFutureMonth = year === now.getFullYear() && m > now.getMonth() + 1
      if (!isFutureMonth) {
        const rows = await computePayroll(session.company_id, year, m)
        laborBaseCost = Math.round(rows.reduce((s, r) => s + r.net_pay, 0) * 100) / 100
      }

      const otCost = Math.round(otByMonth[m].cost * 100) / 100

      chartData.push({
        month: m,
        sick_days: sickDays,
        sick_rate_pct: sickRatePct,
        ot_hours: Math.round(otByMonth[m].hours * 100) / 100,
        ot_cost: otCost,
        labor_base_cost: laborBaseCost,
        labor_total_cost: Math.round((laborBaseCost + otCost) * 100) / 100,
      })
    }

    return ok({ type, year, headcount: headcount ?? 0, data: chartData })
  }

  return badRequest(`Unknown report type: ${type}`)
}
