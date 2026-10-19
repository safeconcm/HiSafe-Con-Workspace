// src/lib/work-schedule.ts
// Per-company work schedule — replaces the old hardcoded assumption
// "Saturday and Sunday are the weekend for every company" with a real,
// per-company weekly pattern (company_work_schedules) plus specific-date
// overrides (company_workday_overrides) that HR can set directly — e.g.
// Highcon works Mon-Sat (only Sunday off), Safecon works Mon-Fri by default
// but HR marks individual Saturdays as worked via an override rather than
// an alternating-week formula.
//
// This is intentionally a single, shared source of truth so every place in
// the app that used to check `dow === 0 || dow === 6` directly can be
// switched over one at a time without duplicating the override-then-
// weekly-pattern-then-fallback logic in each call site.

import type { createAdminSupabaseClient } from '@/lib/api-helpers'

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Bulk-fetch version — for rendering a whole month (PDF/Excel/timesheet
// grid) so we don't run one query per day. Returns a lookup keyed by
// day-of-month number (1..daysInMonth) -> boolean.
export async function getWorkingDayMapForMonth(
  supabase: SupabaseAdmin,
  companyId: string,
  year: number,
  month: number // 1-12
): Promise<Map<number, boolean>> {
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const [{ data: schedule }, { data: overrides }] = await Promise.all([
    supabase.from('company_work_schedules')
      .select('weekday, is_working_day')
      .eq('company_id', companyId),
    supabase.from('company_workday_overrides')
      .select('override_date, is_working_day')
      .eq('company_id', companyId)
      .gte('override_date', monthStart)
      .lte('override_date', monthEnd),
  ])

  const weekdayMap = new Map<number, boolean>((schedule ?? []).map(s => [s.weekday, s.is_working_day]))
  const overrideMap = new Map<string, boolean>((overrides ?? []).map(o => [o.override_date, o.is_working_day]))

  const result = new Map<number, boolean>()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dateStr = toISODate(date)
    if (overrideMap.has(dateStr)) {
      result.set(d, overrideMap.get(dateStr)!)
      continue
    }
    const dow = date.getDay()
    if (weekdayMap.has(dow)) {
      result.set(d, weekdayMap.get(dow)!)
      continue
    }
    // No schedule configured for this company yet — fall back to the old
    // Mon-Fri assumption so nothing breaks before a company's schedule rows
    // exist (e.g. a newly-added company before HR sets one up).
    result.set(d, dow !== 0 && dow !== 6)
  }
  return result
}

// Range version of getWorkingDayMapForMonth (2026-10-19) — needed because a
// real pay cycle (26th of one month through the 25th of the next — see
// cyclePeriod in src/lib/payroll.ts) spans parts of two calendar months, so
// a lookup keyed by day-of-month doesn't work. Keyed by full ISO date
// string instead. Computed once per cycle and shared across every
// employee's rate calculation (see getUserRateForPeriod in payroll.ts)
// rather than querying the schedule/override tables once per employee.
export async function getWorkingDayMapForRange(
  supabase: SupabaseAdmin,
  companyId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
): Promise<Map<string, boolean>> {
  const [{ data: schedule }, { data: overrides }] = await Promise.all([
    supabase.from('company_work_schedules')
      .select('weekday, is_working_day')
      .eq('company_id', companyId),
    supabase.from('company_workday_overrides')
      .select('override_date, is_working_day')
      .eq('company_id', companyId)
      .gte('override_date', startDate)
      .lte('override_date', endDate),
  ])

  const weekdayMap = new Map<number, boolean>((schedule ?? []).map(s => [s.weekday, s.is_working_day]))
  const overrideMap = new Map<string, boolean>((overrides ?? []).map(o => [o.override_date, o.is_working_day]))

  const result = new Map<string, boolean>()
  let cur = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cur <= end) {
    const dateStr = cur.toISOString().split('T')[0]
    if (overrideMap.has(dateStr)) {
      result.set(dateStr, overrideMap.get(dateStr)!)
    } else {
      const dow = cur.getUTCDay()
      result.set(dateStr, weekdayMap.has(dow) ? weekdayMap.get(dow)! : (dow !== 0 && dow !== 6))
    }
    cur = new Date(cur.getTime() + 86400000)
  }
  return result
}

// Single-date version, for one-off checks (e.g. classifying an OT entry).
export async function isWorkingDay(
  supabase: SupabaseAdmin,
  companyId: string,
  date: Date
): Promise<boolean> {
  const dateStr = toISODate(date)
  const { data: override } = await supabase
    .from('company_workday_overrides')
    .select('is_working_day')
    .eq('company_id', companyId)
    .eq('override_date', dateStr)
    .maybeSingle()
  if (override) return override.is_working_day

  const dow = date.getDay()
  const { data: sched } = await supabase
    .from('company_work_schedules')
    .select('is_working_day')
    .eq('company_id', companyId)
    .eq('weekday', dow)
    .maybeSingle()
  if (sched) return sched.is_working_day

  return dow !== 0 && dow !== 6
}

// Timesheet submission deadline resolver (2026-10-19, per request: "ถ้าวันที่
// 25 ตรงวันหยุดบริษัท ให้ส่งก่อนได้ 22 23 24") — walks the normal cutoff day
// (the 25th) backward to the nearest day that is both a working day (per
// this company's schedule/overrides) and not a company holiday, so the
// effective deadline never lands on a day nobody's expected to be at work.
// Used by the Timesheet submit route's hard deadline check — see that
// route's own comment for why the deadline only applies to a timesheet's
// very first submission.
export async function getEffectiveSubmitDeadlineDay(
  supabase: SupabaseAdmin,
  companyId: string,
  year: number,
  month: number,
  cutoffDay = 25
): Promise<number> {
  for (let day = cutoffDay; day >= 1; day--) {
    const date = new Date(year, month - 1, day)
    if (!(await isWorkingDay(supabase, companyId, date))) continue

    const dateStr = toISODate(date)
    const { data: holiday } = await supabase
      .from('holidays')
      .select('id')
      .eq('company_id', companyId)
      .eq('holiday_date', dateStr)
      .eq('is_active', true)
      .maybeSingle()
    if (!holiday) return day
  }
  // Shouldn't happen in practice (would mean every day 1-25 is a day off) —
  // fall back to the plain cutoff rather than let the loop return nothing.
  return cutoffDay
}
