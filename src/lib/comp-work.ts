// src/lib/comp-work.ts
// Shared effect-applier for an approved compensatory-work request
// (ทำงานชดเชยวันหยุด/วันอาทิตย์ — see migration comment on comp_work_requests
// for the full design). Called from both:
//   - POST /api/comp-work, when there's no approver above the requester
//     (org-tree root — auto-approve, same convention as leave/OT)
//   - POST /api/comp-work/[id]/approve, the normal supervisor-approval path
// so the two paths can't drift apart.
//
// Unlike OT (which pays extra and never touches timesheet_lines/leave
// balances at all), a comp-work day:
//   1. Gets a normal 'work' timesheet_line for that date/job/hours — so it
//      counts toward Job Direct Cost exactly like any other workday (at
//      whatever rate that pay cycle already works out to — see
//      getUserRateForPeriod in src/lib/payroll.ts; no special-casing needed
//      here since a comp-work day was never part of the work_days
//      denominator to begin with).
//   2. Refunds `hours / 8` days back onto the offset leave type's
//      used_days balance for that year — the 1:1 offset. No extra pay.
import type { createAdminSupabaseClient } from '@/lib/api-helpers'

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>

export async function applyCompWorkApproval(
  supabase: SupabaseAdmin,
  req: {
    id: string
    company_id: string
    user_id: string
    work_date: string
    job_id: string
    hours: number
    offset_leave_type: string
  }
): Promise<void> {
  const year  = Number(req.work_date.slice(0, 4))
  const month = Number(req.work_date.slice(5, 7))

  // 1. Find-or-create this month's timesheet (mirrors lock_timesheet_for_leave's
  // ON CONFLICT (user_id, year, month) pattern, done in TS here since this
  // path isn't a DB function).
  const { data: existingTs } = await supabase
    .from('timesheets').select('id')
    .eq('user_id', req.user_id).eq('year', year).eq('month', month)
    .maybeSingle()

  let timesheetId = existingTs?.id as string | undefined
  if (!timesheetId) {
    const { data: newTs } = await supabase
      .from('timesheets')
      .insert({ company_id: req.company_id, user_id: req.user_id, year, month })
      .select('id').single()
    timesheetId = newTs?.id
  }
  if (!timesheetId) return // shouldn't happen — nothing sensible to do without a timesheet row

  // 2. Upsert the work line (upsert, not insert, in case of re-approval after
  // a correction — matches the ON CONFLICT ... DO UPDATE in lock_timesheet_for_leave).
  await supabase.from('timesheet_lines').upsert(
    {
      timesheet_id: timesheetId,
      work_date:    req.work_date,
      job_id:       req.job_id,
      hours:        req.hours,
      line_type:    'work',
    },
    { onConflict: 'timesheet_id,work_date,job_id' }
  )

  // 3. Refund the offset leave type's used_days by hours/8 (floor at 0 —
  // same defensive floor used_days updates elsewhere use, e.g. the
  // cancel-leave refund in /api/leave/[id]/approve).
  const daysOffset = req.hours / 8
  const { data: bal } = await supabase
    .from('leave_balances')
    .select('used_days')
    .eq('user_id', req.user_id)
    .eq('leave_type', req.offset_leave_type)
    .eq('year', year)
    .maybeSingle()
  if (bal) {
    await supabase.from('leave_balances')
      .update({ used_days: Math.max((bal.used_days ?? 0) - daysOffset, 0) })
      .eq('user_id', req.user_id)
      .eq('leave_type', req.offset_leave_type)
      .eq('year', year)
  }
}
