// src/lib/payroll.ts
// Wage calculation from approved timesheets — shared by the on-screen
// /payroll view and the /api/export?type=payroll download.
//
// Formula (per the paper-process the user described): a monthly salary is
// converted to a daily rate by dividing by the working days in that
// calendar month (all days minus Sundays); an hourly rate is the daily
// rate divided by 8. Daily/hourly salary_type employees use their rate
// directly. This is the simple, company-agnostic version — it does NOT
// yet account for Safecon's alternating half-Saturday schedule or
// Highcon's 6-day week (that is a separate, not-yet-built piece).
//
// Unpaid leave (taken during probation — see leave_requests.is_unpaid)
// is surfaced as a separate deduction line at the same daily rate.

import { createAdminSupabaseClient } from '@/lib/api-helpers'

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

export async function computePayroll(
  companyId: string, year: number, month: number
): Promise<PayrollUserRow[]> {
  const supabase = createAdminSupabaseClient()
  const workDays = daysInMonth(year, month) - countSundaysInMonth(year, month)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`

  // 1. Approved timesheets for this company/month, with their work lines
  const { data: timesheets } = await supabase
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
    const { data: salaryRow } = await supabase
      .from('salary_records')
      .select('base_salary, salary_type')
      .eq('user_id', ts.user_id)
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
        .eq('user_id', ts.user_id)
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
