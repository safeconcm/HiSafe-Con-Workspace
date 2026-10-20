// src/lib/payroll.ts
// Wage calculation from approved timesheets — shared by the on-screen
// /payroll view and the /api/export?type=payroll download.
//
// Formula (per the paper-process the user described): a monthly salary is
// converted to a daily rate by dividing by the working days in that
// calendar month; an hourly rate is the daily rate divided by 8. Daily/
// hourly salary_type employees use their rate directly.
//
// workDays now comes from this company's actual work schedule
// (company_work_schedules + company_workday_overrides — see
// src/lib/work-schedule.ts) instead of a blanket "all days minus Sundays"
// rule, so Highcon's 6-day week and Safecon's specific worked-Saturday
// overrides are both reflected correctly. Falls back to the old Mon-Fri
// assumption if a company has no schedule rows yet (see getWorkingDayMapForMonth).
//
// Unpaid leave (taken during probation — see leave_requests.is_unpaid)
// is surfaced as a separate deduction line at the same daily rate.

import { createAdminSupabaseClient } from '@/lib/api-helpers'
import { getWorkingDayMapForMonth, getWorkingDayMapForRange } from '@/lib/work-schedule'
import { activityCodeLabel, UNCLASSIFIED_CODE } from '@/lib/activity-codes'

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function countSundaysInMonth(year: number, month: number): number {
  const total = daysInMonth(year, month)
  let count = 0
  for (let d = 1; d <= total; d++) {
    if (new Date(year, month - 1, d).getDay() === 0) count++
  }
  return count
}

// Counts actual working days for a specific company/month per its work
// schedule (weekly pattern + date overrides), replacing the old
// daysInMonth - countSundaysInMonth blanket formula.
export async function countCompanyWorkDays(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  companyId: string, year: number, month: number
): Promise<number> {
  const workingDayMap = await getWorkingDayMapForMonth(supabase, companyId, year, month)
  let count = 0
  for (const isWorking of workingDayMap.values()) {
    if (isWorking) count++
  }
  return count
}

export interface PayrollJobLine {
  job_id: string | null
  job_code: string
  job_name: string
  hours: number
  cost: number
}

export interface PayrollUserRow {
  user_id: string
  employee_code: string
  name: string
  department: string | null
  salary_type: string
  base_salary: number
  daily_rate: number
  hourly_rate: number
  jobs: PayrollJobLine[]
  total_hours: number
  total_job_cost: number
  unpaid_leave_days: number
  unpaid_deduction: number
  net_pay: number
}

export interface UserRate {
  salary_type: string
  base_salary: number
  daily_rate: number
  hourly_rate: number
}

// Resolves a user's daily/hourly rate as of a given month-end — shared by
// computePayroll() below and by the OT-cost calculation in the executive
// summary report (see /api/hr/reports?type=exec_summary), so both places
// use the exact same salary lookup + monthly-rate math instead of two
// copies that could silently drift apart.
export async function getUserRate(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  userId: string, monthEnd: string, workDays: number
): Promise<UserRate> {
  const { data: salaryRow } = await supabase
    .from('salary_records')
    .select('base_salary, salary_type')
    .eq('user_id', userId)
    .eq('status', 'approved') // 2026-10-20, "ข้อ 2" — a pending adjustment must never affect pay
    .lte('effective_date', monthEnd)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  let base_salary = salaryRow?.base_salary
  let salary_type = salaryRow?.salary_type
  if (base_salary === undefined || base_salary === null) {
    const { data: contract } = await supabase
      .from('contracts')
      .select('base_salary, salary_type')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    base_salary = contract?.base_salary ?? 0
    salary_type = contract?.salary_type ?? 'monthly'
  }

  let daily_rate = 0
  let hourly_rate = 0
  if (salary_type === 'daily') {
    daily_rate = Number(base_salary)
    hourly_rate = daily_rate / 8
  } else if (salary_type === 'hourly') {
    hourly_rate = Number(base_salary)
    daily_rate = hourly_rate * 8
  } else {
    daily_rate = workDays > 0 ? Number(base_salary) / workDays : 0
    hourly_rate = daily_rate / 8
  }

  return {
    salary_type: salary_type ?? 'monthly',
    base_salary: Number(base_salary),
    daily_rate: Math.round(daily_rate * 100) / 100,
    hourly_rate: Math.round(hourly_rate * 100) / 100,
  }
}

export async function computePayroll(
  companyId: string, year: number, month: number,
  // Restricts results to these user_ids — used to scope a supervisor's
  // "my team" payroll view (see /api/payroll/route.ts) to their direct
  // reports via organization_nodes, instead of the whole company (HR/
  // admin still get the unfiltered company-wide view by omitting this).
  opts?: { userIds?: string[] }
): Promise<PayrollUserRow[]> {
  const supabase = createAdminSupabaseClient()
  const workDays = await countCompanyWorkDays(supabase, companyId, year, month)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`

  if (opts?.userIds && opts.userIds.length === 0) return []

  // 1. Approved timesheets for this company/month, with their work lines
  let timesheetsQuery = supabase
    .from('timesheets')
    .select(`
      id, user_id,
      user:users!timesheets_user_id_fkey(id, employee_code, first_name_th, last_name_th, department),
      lines:timesheet_lines(hours, line_type, job:jobs(id, job_code, name_th))
    `)
    .eq('company_id', companyId)
    .eq('year', year)
    .eq('month', month)
    .eq('status', 'approved')
  if (opts?.userIds) timesheetsQuery = timesheetsQuery.in('user_id', opts.userIds)
  const { data: timesheets } = await timesheetsQuery

  // 2. Unpaid leave days per user this month (probation leave — see item 13)
  const { data: unpaidLeave } = await supabase
    .from('leave_requests')
    .select('user_id, total_days')
    .eq('company_id', companyId)
    .eq('is_unpaid', true)
    .eq('status', 'approved')
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd)

  const unpaidByUser = new Map<string, number>()
  for (const l of unpaidLeave ?? []) {
    unpaidByUser.set(l.user_id, (unpaidByUser.get(l.user_id) ?? 0) + Number(l.total_days))
  }

  const rows: PayrollUserRow[] = []

  for (const ts of timesheets ?? []) {
    const user = (ts as any).user
    if (!user) continue

    // Latest salary as of this month (fallback to active contract if no salary_records yet)
    const { salary_type, base_salary, daily_rate, hourly_rate } =
      await getUserRate(supabase, ts.user_id, monthEnd, workDays)

    const jobMap = new Map<string, PayrollJobLine>()
    let total_hours = 0
    for (const line of (ts as any).lines ?? []) {
      if (line.line_type !== 'work') continue
      const job = line.job
      const key = job?.id ?? 'unassigned'
      const hours = Number(line.hours)
      total_hours += hours
      const existing = jobMap.get(key)
      if (existing) {
        existing.hours += hours
        existing.cost = Math.round(existing.hours * hourly_rate * 100) / 100
      } else {
        jobMap.set(key, {
          job_id: job?.id ?? null,
          job_code: job?.job_code ?? '—',
          job_name: job?.name_th ?? 'ไม่ระบุ Job',
          hours,
          cost: Math.round(hours * hourly_rate * 100) / 100,
        })
      }
    }

    const total_job_cost = Math.round(total_hours * hourly_rate * 100) / 100
    const unpaid_leave_days = unpaidByUser.get(ts.user_id) ?? 0
    const unpaid_deduction = Math.round(unpaid_leave_days * daily_rate * 100) / 100

    rows.push({
      user_id: ts.user_id,
      employee_code: user.employee_code,
      name: `${user.first_name_th} ${user.last_name_th}`,
      department: user.department,
      salary_type,
      base_salary: Number(base_salary),
      daily_rate: Math.round(daily_rate * 100) / 100,
      hourly_rate: Math.round(hourly_rate * 100) / 100,
      jobs: Array.from(jobMap.values()),
      total_hours,
      total_job_cost,
      unpaid_leave_days,
      unpaid_deduction,
      net_pay: Math.round((total_job_cost - unpaid_deduction) * 100) / 100,
    })
  }

  return rows
}

// Job Direct Cost summary (2026-10-16, reworked 2026-10-19) — per request:
// "ค่าแรง/payroll ต้องเป็น Job Direct Cost summary รายเดือน รายปี ตาม Job".
// computePayroll() above answers "how much does each employee cost, broken
// down by job" for a calendar month — this answers the inverse, more useful
// question for project/job costing: "how much labor cost landed on each Job
// Code", for either one pay cycle or a whole year.
//
// 2026-10-19 rework: the company's real pay cycle is NOT the calendar month
// — Timesheets are grouped by calendar month in the UI, but the actual cost
// period the business cares about runs 26th-of-previous-month through
// 25th-of-this-month (see cyclePeriod below). Reusing computePayroll() (as
// this function originally did) can't express that, since computePayroll
// fetches whole Timesheets by their (year, month) fields. This version
// queries timesheet_lines directly by their real work_date instead, so a
// cycle correctly picks up the tail end of the previous calendar month's
// Timesheet together with the front end of this month's.
//
// The trickier part is the hourly rate, not the hours: an employee's rate
// is "monthly salary ÷ working days", and the working-day count has to come
// from the SAME window the rate is applied to, or the numbers stop
// reconciling (208 hours at a blended rate across a cycle should cost
// exactly the salary paid for that cycle, assuming full attendance — see
// getUserRateForPeriod). A plain calendar-month rate breaks that even when
// salary never changed, purely because 26-30 Sept and 1-25 Oct don't add up
// to either month's own working-day count.
export interface JobCostSummaryLine {
  job_id: string | null
  job_code: string
  job_name: string
  hours: number
  cost: number
  employee_count: number
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Real pay-cycle boundaries. Deliberately a fixed accounting period that
// never shifts for holidays — a separate concept from the Timesheet
// submission deadline (which DOES roll back to the nearest working day when
// the 25th is a day off — see getEffectiveSubmitDeadlineDay in
// work-schedule.ts). "Cycle labelled October" = 26 Sept through 25 Oct.
const CYCLE_CUTOFF_DAY = 25

export function cyclePeriod(year: number, month: number): { start: string; end: string } {
  const end = ymd(year, month, CYCLE_CUTOFF_DAY)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  const start = ymd(prevYear, prevMonth, CYCLE_CUTOFF_DAY + 1)
  return { start, end }
}

export interface PeriodRate {
  salary_type: string
  base_salary: number   // salary in effect at the end of the period — kept for display, same meaning as UserRate.base_salary
  daily_rate: number
  hourly_rate: number
  work_days: number
}

// Resolves a monthly-salary employee's rate for an arbitrary date range
// (a pay cycle, not a calendar month) by weighting each of the period's
// actual working days by whichever salary was in effect that specific day.
// If salary never changed during the period this collapses automatically to
// the plain "salary ÷ working days ÷ 8" formula (no special-casing needed)
// — it only does extra work on the rare month a raise/cut lands mid-cycle,
// and even then the result still reconciles exactly to what should have
// been paid (old rate for the days under the old salary, new rate for the
// days under the new one), rather than guessing which one to apply to the
// whole cycle.
export async function getUserRateForPeriod(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  periodStart: string, // YYYY-MM-DD
  periodEnd: string,   // YYYY-MM-DD
  workingDayMap: Map<string, boolean> // from getWorkingDayMapForRange — shared across employees for this period
): Promise<PeriodRate> {
  const { data: records } = await supabase
    .from('salary_records')
    .select('base_salary, salary_type, effective_date')
    .eq('user_id', userId)
    .eq('status', 'approved') // 2026-10-20, "ข้อ 2" — a pending adjustment must never affect pay
    .lte('effective_date', periodEnd)
    .order('effective_date', { ascending: true })

  let salary_type = 'monthly'
  let latestSalary = 0
  // Ordered list of { from, salary } — the salary active from `from` onward
  // until the next segment's `from` (or periodEnd). Sorted ascending.
  const segments: { from: string; salary: number }[] = []

  if (records && records.length > 0) {
    const last = records[records.length - 1]
    salary_type = last.salary_type ?? 'monthly'
    latestSalary = Number(last.base_salary)

    const beforeOrAtStart = records.filter(r => r.effective_date <= periodStart)
    const baseline = beforeOrAtStart[beforeOrAtStart.length - 1]
    if (baseline) segments.push({ from: periodStart, salary: Number(baseline.base_salary) })
    for (const r of records) {
      if (r.effective_date > periodStart) segments.push({ from: r.effective_date, salary: Number(r.base_salary) })
    }
    // Every record's effective_date is after periodStart (e.g. a brand-new
    // employee whose first salary record lands mid-period) — nothing to use
    // as a periodStart baseline, so start the one segment from that
    // earliest record instead of leaving a gap.
    if (segments.length === 0) segments.push({ from: records[0].effective_date, salary: Number(records[0].base_salary) })
  } else {
    const { data: contract } = await supabase
      .from('contracts')
      .select('base_salary, salary_type')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestSalary = Number(contract?.base_salary ?? 0)
    salary_type = contract?.salary_type ?? 'monthly'
    segments.push({ from: periodStart, salary: latestSalary })
  }

  const periodDates = Array.from(workingDayMap.entries())
    .filter(([d]) => d >= periodStart && d <= periodEnd)

  // Daily/hourly salary types already pay per actual day/hour worked — no
  // monthly-to-daily conversion needed, so no weighting either. Mirrors
  // getUserRate()'s existing behavior, just scoped to this period's
  // working-day count instead of a calendar month's.
  if (salary_type === 'daily' || salary_type === 'hourly') {
    const rate = segments[segments.length - 1].salary
    const work_days = periodDates.filter(([, isWorking]) => isWorking).length
    const daily_rate  = salary_type === 'daily' ? rate : rate * 8
    const hourly_rate = salary_type === 'daily' ? rate / 8 : rate
    return {
      salary_type, base_salary: rate,
      daily_rate: Math.round(daily_rate * 100) / 100,
      hourly_rate: Math.round(hourly_rate * 100) / 100,
      work_days,
    }
  }

  // segments is sorted ascending by `from` — walk forward, keeping the last
  // segment whose `from` is on/before the given date.
  const salaryForDate = (date: string): number => {
    let result = segments[0].salary
    for (const seg of segments) {
      if (seg.from <= date) result = seg.salary
      else break
    }
    return result
  }

  // 2026-10-19: 'study' leave (ลาศึกษา) is paid in full but its days are
  // deliberately excluded from work_days below — per request: a monthly
  // salary spread over fewer actual working days means a higher
  // daily/hourly rate for the days the employee DID work, so the cost of
  // their study leave is absorbed into whatever Job they logged hours
  // against that cycle rather than reducing their pay. Other leave types
  // (annual/sick/personal/maternity/other) are NOT touched — those days
  // simply have no 'work' timesheet_line, so they already don't add
  // hours/cost anywhere; only 'study' changes the rate itself.
  // Derived from leave_requests directly (overlap check, not a date
  // equality filter) rather than timesheet_lines — simpler than reaching
  // through an embedded-relation filter, and the weekday/holiday skip is
  // already handled below by only excluding dates that are in periodDates
  // with isWorking=true (periodDates already came from workingDayMap).
  const { data: studyLeaves } = await supabase
    .from('leave_requests')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .eq('leave_type', 'study')
    .eq('status', 'approved')
    .lte('start_date', periodEnd)
    .gte('end_date', periodStart)
  const studyLeaveDates = new Set(
    periodDates
      .filter(([d]) => (studyLeaves ?? []).some(l => d >= l.start_date && d <= l.end_date))
      .map(([d]) => d)
  )

  let weightedSalarySum = 0
  let work_days = 0
  for (const [d, isWorking] of periodDates) {
    if (!isWorking) continue
    if (studyLeaveDates.has(d)) continue  // ลาศึกษา — see comment above
    work_days++
    weightedSalarySum += salaryForDate(d)
  }

  // weightedSalarySum is Σ(salary_segment × workdays_in_segment) — i.e. each
  // segment's full monthly salary counted once per working day it covers.
  // Dividing by work_days once only collapses that back to a single
  // segment's monthly salary (a no-op when salary never changed — the bug
  // this comment replaces: it was paying the full base_salary as the daily
  // rate). The correct daily rate needs a second division by work_days: the
  // first collapses the segments into one "blended monthly-equivalent"
  // figure (Σ(salary_segment × workdays_in_segment) / work_days), the second
  // spreads that monthly-equivalent evenly over the period's working days —
  // see getUserRateForPeriod's own comment for the reconciliation check.
  const daily_rate  = work_days > 0 ? weightedSalarySum / (work_days * work_days) : 0
  const hourly_rate = daily_rate / 8

  return {
    salary_type, base_salary: latestSalary,
    daily_rate: Math.round(daily_rate * 100) / 100,
    hourly_rate: Math.round(hourly_rate * 100) / 100,
    work_days,
  }
}

export async function computeJobCostSummary(
  companyId: string, year: number, month?: number
): Promise<JobCostSummaryLine[]> {
  const cycles = month ? [cyclePeriod(year, month)] : Array.from({ length: 12 }, (_, i) => cyclePeriod(year, i + 1))

  const supabase = createAdminSupabaseClient()
  const jobMap = new Map<string, JobCostSummaryLine & { employees: Set<string> }>()

  for (const { start, end } of cycles) {
    // Shared per-cycle working-day map — computed once, reused by every
    // employee's rate below instead of a schedule/override query per
    // employee (see getUserRateForPeriod).
    const workingDayMap = await getWorkingDayMapForRange(supabase, companyId, start, end)

    // Which calendar-month Timesheets could possibly contain a work_date in
    // this cycle — almost always exactly the two months the cycle's start
    // and end fall in. Queried as plain timesheets rows (not a nested
    // relation filter) to stay within the same query patterns already used
    // elsewhere in this file.
    const startYM = { y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) }
    const endYM   = { y: Number(end.slice(0, 4)),   m: Number(end.slice(5, 7)) }
    const monthPairs = (startYM.y === endYM.y && startYM.m === endYM.m) ? [startYM] : [startYM, endYM]

    const { data: timesheetsInRange } = await supabase
      .from('timesheets')
      .select('id, user_id')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .or(monthPairs.map(p => `and(year.eq.${p.y},month.eq.${p.m})`).join(','))

    if (!timesheetsInRange || timesheetsInRange.length === 0) continue

    const userByTimesheet = new Map(timesheetsInRange.map(t => [t.id, t.user_id]))

    const { data: lines } = await supabase
      .from('timesheet_lines')
      .select('hours, work_date, timesheet_id, job:jobs(id, job_code, name_th)')
      .in('timesheet_id', timesheetsInRange.map(t => t.id))
      .eq('line_type', 'work')
      .gte('work_date', start)
      .lte('work_date', end)

    // Group by employee first so each employee's rate is resolved once per
    // cycle, not once per job line.
    const byUser = new Map<string, { job_id: string | null; job_code: string; job_name: string; hours: number }[]>()
    for (const line of lines ?? []) {
      const userId = userByTimesheet.get(line.timesheet_id)
      if (!userId) continue
      const job = (line as any).job
      const arr = byUser.get(userId) ?? []
      arr.push({
        job_id: job?.id ?? null,
        job_code: job?.job_code ?? '—',
        job_name: job?.name_th ?? 'ไม่ระบุ Job',
        hours: Number(line.hours),
      })
      byUser.set(userId, arr)
    }

    for (const [userId, userLines] of byUser) {
      const rate = await getUserRateForPeriod(supabase, userId, start, end, workingDayMap)
      for (const l of userLines) {
        const key = l.job_id ?? `code:${l.job_code}`
        const cost = Math.round(l.hours * rate.hourly_rate * 100) / 100
        const existing = jobMap.get(key)
        if (existing) {
          existing.hours += l.hours
          existing.cost = Math.round((existing.cost + cost) * 100) / 100
          existing.employees.add(userId)
        } else {
          jobMap.set(key, {
            job_id: l.job_id, job_code: l.job_code, job_name: l.job_name,
            hours: l.hours, cost, employee_count: 1, employees: new Set([userId]),
          })
        }
      }
    }
  }

  return Array.from(jobMap.values())
    .map(({ employees, ...rest }) => ({ ...rest, employee_count: employees.size }))
    .sort((a, b) => b.cost - a.cost)
}

// ── Cost Centers (Activity Code) summary ────────────────────────────────
// 2026-10-20, per request: "Time sheet ช่องให้เลือก Activity code ... ดึง
// ข้อมูลไปสร้าง Tab เพิ่มใน CONNEX Access ว่า Cost Centers จัดแยกรวมกรองตาม
// Cost Centers ทั้ง 11 รูป ที่บันทึกเชื่อมโยงมาจาก Time sheet". Same shape
// and cost math as computeJobCostSummary above (same cycles, same
// getUserRateForPeriod per employee), but grouped by timesheet_lines.
// activity_code instead of job_id — the 11 standardized Activity Codes from
// Section B of the official Timesheet form (see src/lib/activity-codes.ts),
// not the Job Code. A line with no activity_code (not yet classified, or
// logged before the dropdown existed) falls into its own
// UNCLASSIFIED_CODE bucket rather than being dropped or merged into a real
// code, so gaps in classification stay visible rather than silently
// disappearing from the total.
//
// Each code also carries a `jobs` breakdown (which Job Codes the hours under
// that Activity Code came from) for drill-down, since one Activity Code is
// typically spread across many Jobs (e.g. every Job's site-supervision hours
// all land under '04').
export interface CostCenterJobBreakdown {
  job_id: string | null
  job_code: string
  job_name: string
  hours: number
  cost: number
}

export interface CostCenterSummaryLine {
  activity_code: string   // one of '01'..'11', or UNCLASSIFIED_CODE
  activity_label: string
  hours: number
  cost: number
  employee_count: number
  jobs: CostCenterJobBreakdown[]
}

export async function computeCostCenterSummary(
  companyId: string, year: number, month?: number
): Promise<CostCenterSummaryLine[]> {
  const cycles = month ? [cyclePeriod(year, month)] : Array.from({ length: 12 }, (_, i) => cyclePeriod(year, i + 1))

  const supabase = createAdminSupabaseClient()
  type Bucket = {
    activity_code: string; activity_label: string
    hours: number; cost: number
    employees: Set<string>
    jobs: Map<string, CostCenterJobBreakdown>
  }
  const codeMap = new Map<string, Bucket>()

  for (const { start, end } of cycles) {
    const workingDayMap = await getWorkingDayMapForRange(supabase, companyId, start, end)

    const startYM = { y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) }
    const endYM   = { y: Number(end.slice(0, 4)),   m: Number(end.slice(5, 7)) }
    const monthPairs = (startYM.y === endYM.y && startYM.m === endYM.m) ? [startYM] : [startYM, endYM]

    const { data: timesheetsInRange } = await supabase
      .from('timesheets')
      .select('id, user_id')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .or(monthPairs.map(p => `and(year.eq.${p.y},month.eq.${p.m})`).join(','))

    if (!timesheetsInRange || timesheetsInRange.length === 0) continue

    const userByTimesheet = new Map(timesheetsInRange.map(t => [t.id, t.user_id]))

    const { data: lines } = await supabase
      .from('timesheet_lines')
      .select('hours, work_date, timesheet_id, activity_code, job:jobs(id, job_code, name_th)')
      .in('timesheet_id', timesheetsInRange.map(t => t.id))
      .eq('line_type', 'work')
      .gte('work_date', start)
      .lte('work_date', end)

    const byUser = new Map<string, {
      activity_code: string
      job_id: string | null; job_code: string; job_name: string; hours: number
    }[]>()
    for (const line of lines ?? []) {
      const userId = userByTimesheet.get(line.timesheet_id)
      if (!userId) continue
      const job = (line as any).job
      const arr = byUser.get(userId) ?? []
      arr.push({
        activity_code: (line as any).activity_code || UNCLASSIFIED_CODE,
        job_id: job?.id ?? null,
        job_code: job?.job_code ?? '—',
        job_name: job?.name_th ?? 'ไม่ระบุ Job',
        hours: Number(line.hours),
      })
      byUser.set(userId, arr)
    }

    for (const [userId, userLines] of byUser) {
      const rate = await getUserRateForPeriod(supabase, userId, start, end, workingDayMap)
      for (const l of userLines) {
        const cost = Math.round(l.hours * rate.hourly_rate * 100) / 100
        let bucket = codeMap.get(l.activity_code)
        if (!bucket) {
          bucket = {
            activity_code: l.activity_code,
            activity_label: activityCodeLabel(l.activity_code === UNCLASSIFIED_CODE ? null : l.activity_code),
            hours: 0, cost: 0, employees: new Set(), jobs: new Map(),
          }
          codeMap.set(l.activity_code, bucket)
        }
        bucket.hours += l.hours
        bucket.cost = Math.round((bucket.cost + cost) * 100) / 100
        bucket.employees.add(userId)

        const jobKey = l.job_id ?? `code:${l.job_code}`
        const existingJob = bucket.jobs.get(jobKey)
        if (existingJob) {
          existingJob.hours += l.hours
          existingJob.cost = Math.round((existingJob.cost + cost) * 100) / 100
        } else {
          bucket.jobs.set(jobKey, { job_id: l.job_id, job_code: l.job_code, job_name: l.job_name, hours: l.hours, cost })
        }
      }
    }
  }

  return Array.from(codeMap.values())
    .map(({ employees, jobs, ...rest }) => ({
      ...rest,
      employee_count: employees.size,
      jobs: Array.from(jobs.values()).sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => {
      // Unclassified always last regardless of cost — it's a "needs
      // attention" bucket, not a real cost center to rank competitively.
      if (a.activity_code === UNCLASSIFIED_CODE) return 1
      if (b.activity_code === UNCLASSIFIED_CODE) return -1
      return b.cost - a.cost
    })
}
