// src/app/api/hr/payroll-salary/route.ts
// GET /api/hr/payroll-salary?year=&month= — monthly payroll roster for
// salaried ("Staff") employees (2026-10-16), per request: "ต้องแยก Payroll
// กับ Timesheet เพราะ Timesheet payroll จะเอาคำนวณเงินลง job cost ตาม Job".
//
// /api/payroll (src/lib/payroll.ts computePayroll) answers a different
// question — "how much labor cost to allocate to which Job Code this
// month" — and only lists people who actually submitted an approved
// Timesheet. Salaried staff often don't track hours against Job Codes at
// all, so they never show up there. This route answers the actual payroll
// question instead — "what do I pay this person, and what (if anything) do
// I deduct" — for every active employee, regardless of Timesheet activity.
//
// Reuses getUserRate() from src/lib/payroll.ts (same base-salary lookup:
// latest salary_records row, falling back to the active contract) so the
// "current salary" shown here always agrees with what Timesheet payroll
// would compute, even though the two pages are used for different
// purposes. Also surfaces a *suggested* deduction for unpaid leave taken
// this month (same is_unpaid flag / daily-rate math as computePayroll's
// own unpaid-leave line) — HR can accept, edit, or clear it before saving;
// nothing is deducted automatically without review.
//
// Saving a month's payroll writes to the existing salary_records table via
// the existing POST /api/hr/salary (no new table) — a monthly payroll
// entry for a salaried employee really is just a dated salary record with
// deductions/notes, which that table + API already fully supported; this
// route only adds the *roster* view on top so HR isn't filling the form
// from scratch for each person every month.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
} from '@/lib/api-helpers'
import { getUserRate, countCompanyWorkDays, daysInMonth } from '@/lib/payroll'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  // Stricter than /api/payroll (which also lets supervisors see their
  // team's job-cost breakdown) — this is each person's actual pay +
  // deductions, so HR/Admin only.
  if (!['hr', 'admin'].includes(session.role)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  if (month < 1 || month > 12) return badRequest('month ต้องอยู่ระหว่าง 1-12')

  const supabase = createAdminSupabaseClient()
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`
  const workDays = await countCompanyWorkDays(supabase, session.company_id, year, month)

  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, employee_code, first_name_th, last_name_th, department, position_th, status')
    .eq('company_id', session.company_id)
    .eq('status', 'active')
    .order('employee_code')
  if (usersErr) return badRequest(usersErr.message)

  // Unpaid leave taken this month, per user — same query computePayroll()
  // uses for its own unpaid-leave deduction line (see src/lib/payroll.ts).
  const { data: unpaidLeave } = await supabase
    .from('leave_requests')
    .select('user_id, total_days')
    .eq('company_id', session.company_id)
    .eq('is_unpaid', true)
    .eq('status', 'approved')
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd)
  const unpaidByUser = new Map<string, number>()
  for (const l of unpaidLeave ?? []) {
    unpaidByUser.set(l.user_id, (unpaidByUser.get(l.user_id) ?? 0) + Number(l.total_days))
  }

  // Already-recorded payroll entries for this exact month (effective_date =
  // the 1st of the selected month — see the "reason/effective_date"
  // convention this route's POST counterpart on the page uses) — lets the
  // UI show a record as closed instead of inviting a duplicate entry.
  const { data: existingRecords } = await supabase
    .from('salary_records')
    .select('id, user_id, base_salary, deductions, net_salary, notes, created_at')
    .eq('company_id', session.company_id)
    .eq('effective_date', monthStart)
  const existingByUser = new Map((existingRecords ?? []).map((r: any) => [r.user_id, r]))

  const rows = []
  for (const u of users ?? []) {
    const rate = await getUserRate(supabase, u.id, monthEnd, workDays)
    const unpaid_leave_days = unpaidByUser.get(u.id) ?? 0
    const suggested_deduction = Math.round(unpaid_leave_days * rate.daily_rate * 100) / 100
    rows.push({
      user_id: u.id,
      employee_code: u.employee_code,
      name: `${u.first_name_th} ${u.last_name_th}`,
      department: u.department,
      position_th: u.position_th,
      salary_type: rate.salary_type,
      base_salary: rate.base_salary,
      daily_rate: rate.daily_rate,
      unpaid_leave_days,
      suggested_deduction,
      existing: existingByUser.get(u.id) ?? null,
    })
  }

  return ok({ year, month, rows })
}
