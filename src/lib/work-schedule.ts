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
