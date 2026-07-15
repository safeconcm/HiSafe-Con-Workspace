// src/app/api/timesheet/route.ts
// GET  /api/timesheet            — list my timesheets
// GET  /api/timesheet?year&month — get or init current month timesheet

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError,
} from '@/lib/api-helpers'
import { getWorkingDayMapForMonth } from '@/lib/work-schedule'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const year  = searchParams.get('year')
  const month = searchParams.get('month')

  const supabase = createAdminSupabaseClient()

  // ── Single month: get or auto-create ──────────────────────
  if (year && month) {
    const y = parseInt(year)
    const m = parseInt(month)

    // Try to find existing
    let { data: ts } = await supabase
      .from('timesheets')
      .select(`*, lines:timesheet_lines(*)`)
      .eq('user_id', session.id)
      .eq('year', y)
      .eq('month', m)
      .single()

    // Auto-create draft if missing
    if (!ts) {
      const { data: newTs, error } = await supabase
        .from('timesheets')
        .insert({
          company_id: session.company_id,
          user_id:    session.id,
          year:       y,
          month:      m,
          status:     'draft',
        })
        .select()
        .single()

      if (error) return serverError(error)
      ts = { ...newTs, lines: [] }
    }

    // Fetch holidays for this month
    const { data: holidays } = await supabase
      .from('holidays')
      .select('holiday_date, name_th')
      .eq('company_id', session.company_id)
      .gte('holiday_date', `${y}-${String(m).padStart(2,'0')}-01`)
      .lte('holiday_date', `${y}-${String(m).padStart(2,'0')}-31`)
      .eq('is_active', true)

    // Fetch approved leaves this month
    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, is_half_day, half_day_period, total_days')
      .eq('user_id', session.id)
      .eq('status', 'approved')
      .lte('start_date', `${y}-${String(m).padStart(2,'0')}-31`)
      .gte('end_date',   `${y}-${String(m).padStart(2,'0')}-01`)

    // Fetch active jobs for the year
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, job_code, name_th, name_en')
      .eq('company_id', session.company_id)
      .eq('year', y)
      .eq('status', 'active')
      .order('job_code')

    // This company's actual working-day pattern for the month (weekly
    // pattern + date overrides — see src/lib/work-schedule.ts), so the
    // on-screen grid shades/locks the right days instead of assuming
    // every company's weekend is Sat+Sun. Sent as a plain object since
    // Map isn't JSON-serializable.
    const workingDayMap = await getWorkingDayMapForMonth(supabase, session.company_id, y, m)

    // 2026-07-16: nickname + Based — shown in the editor header and used on
    // the Timesheet official-form export. Small additive lookup; session
    // already carries id/company_id/role, not the profile fields below.
    const { data: profile } = await supabase
      .from('users').select('nickname, based').eq('id', session.id).single()

    return ok({
      timesheet: ts, holidays: holidays ?? [], leaves: leaves ?? [], jobs: jobs ?? [],
      workingDays: Object.fromEntries(workingDayMap),
      user: profile ?? null,
    })
  }

  // ── List: all my timesheets ────────────────────────────────
  const { data, error } = await supabase
    .from('timesheets')
    .select('id, year, month, status, total_hours, submitted_at, approved_at')
    .eq('user_id', session.id)
    .eq('company_id', session.company_id)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(24)

  if (error) return serverError(error)
  return ok({ timesheets: data ?? [] })
}
