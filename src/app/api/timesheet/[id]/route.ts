// src/app/api/timesheet/[id]/route.ts
// GET   /api/timesheet/:id  — full timesheet with lines
// PATCH /api/timesheet/:id  — save/update lines (draft only)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'
import { getWorkingDayMapForMonth } from '@/lib/work-schedule'

type Ctx = { params: Promise<{ id: string }> }

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('timesheets')
    .select(`
      *,
      user:users!timesheets_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, position_th, department, nickname, based
      ),
      approver:users!timesheets_current_approver_id_fkey(
        id, first_name_th, last_name_th
      ),
      approved_by:users!timesheets_approved_by_id_fkey(
        id, first_name_th, last_name_th
      ),
      lines:timesheet_lines(
        id, work_date, job_id, hours, line_type, leave_request_id, remark, activity_code,
        job:jobs(id, job_code, name_th)
      ),
      approvals:timesheet_approvals(
        id, action, comment, sequence, acted_at,
        approver:users!timesheet_approvals_approver_id_fkey(id, first_name_th, last_name_th)
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !data) return notFound('Timesheet')

  // Employee: own only
  if (session.role === 'employee' && data.user_id !== session.id) return forbidden()
  // Supervisor: own, currently assigned to approve, or the one who already
  // decided it — current_approver_id gets nulled the moment a decision is
  // made (see approve/reject routes), so checking only that field would
  // 403 a supervisor trying to view something they themselves already
  // approved/rejected. Mirrors the equivalent fix on the leave route.
  if (session.role === 'supervisor' &&
      data.user_id !== session.id &&
      data.current_approver_id !== session.id &&
      data.approved_by_id !== session.id &&
      data.rejected_by_id !== session.id) return forbidden()

  // Fetch the same jobs/holidays/leaves/workingDays context the personal
  // month editor (/api/timesheet?year&month) and the PDF renderer
  // (/api/pdf/timesheet/[id]) already assemble, so the "ดูรายละเอียด" viewer
  // can render the daily detail as the familiar Job×Date grid
  // (TimesheetGrid, disabled) instead of a long flat per-line table — see
  // conversation 2026-07-11 ("รูปแบบที่แสดง มันก็ยาวเกินไป ควรจะเอารูปแบบแสดง
  // Timesheet เดิมมาแสดง").
  const monthPad = String(data.month).padStart(2, '0')

  const { data: holidays } = await supabase
    .from('holidays')
    .select('holiday_date, name_th')
    .eq('company_id', session.company_id)
    .gte('holiday_date', `${data.year}-${monthPad}-01`)
    .lte('holiday_date', `${data.year}-${monthPad}-31`)
    .eq('is_active', true)

  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, is_half_day, half_day_period, total_days')
    .eq('user_id', data.user_id)
    .eq('status', 'approved')
    .lte('start_date', `${data.year}-${monthPad}-31`)
    .gte('end_date',   `${data.year}-${monthPad}-01`)

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_code, name_th, name_en')
    .eq('company_id', session.company_id)
    .eq('year', data.year)
    .eq('status', 'active')
    .order('job_code')

  const workingDayMap = await getWorkingDayMapForMonth(supabase, session.company_id, data.year, data.month)

  return ok({
    timesheet: data,
    holidays: holidays ?? [],
    leaves: leaves ?? [],
    jobs: jobs ?? [],
    workingDays: Object.fromEntries(workingDayMap),
  })
}

// ── PATCH — save timesheet lines ─────────────────────────────
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  // Fetch timesheet
  const { data: ts } = await supabase
    .from('timesheets')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!ts) return notFound('Timesheet')
  if (ts.user_id !== session.id && !isHROrAdmin(session)) return forbidden()
  if (!['draft', 'rejected'].includes(ts.status)) {
    return badRequest('สามารถแก้ไขได้เฉพาะ Timesheet ที่เป็น Draft หรือถูกส่งคืน')
  }

  let body: { lines: { work_date: string; job_id: string; hours: number; remark?: string; activity_code?: string }[] }
  try { body = await req.json() } catch { return badRequest('Invalid JSON') }
  if (!Array.isArray(body.lines)) return badRequest('lines array required')

  // ── Validate each line ────────────────────────────────────
  const year  = ts.year
  const month = ts.month

  // Fetch holidays for this month
  const { data: holidays } = await supabase
    .from('holidays')
    .select('holiday_date')
    .eq('company_id', session.company_id)
    .eq('year', year)
    .eq('is_active', true)
  const holidayDates = new Set((holidays ?? []).map((h: any) => h.holiday_date))

  // Fetch leave lines (auto-locked by approved leave)
  const { data: leaveLines } = await supabase
    .from('timesheet_lines')
    .select('work_date, hours')
    .eq('timesheet_id', params.id)
    .eq('line_type', 'leave')
  const leaveLocked = new Map<string, number>()
  ;(leaveLines ?? []).forEach((l: any) => leaveLocked.set(l.work_date, l.hours))

  // Validate each line
  const errors: string[] = []
  const dailyTotals = new Map<string, number>()

  for (const line of body.lines) {
    const d = new Date(line.work_date)
    const dow = d.getDay()
    const dateStr = line.work_date

    // Must be in this month/year
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) {
      errors.push(`${dateStr}: วันที่ไม่อยู่ในเดือนนี้`)
      continue
    }
    // No weekends
    if (dow === 0 || dow === 6) {
      errors.push(`${dateStr}: ไม่สามารถกรอกวันเสาร์-อาทิตย์`)
      continue
    }
    // No holidays
    if (holidayDates.has(dateStr)) {
      errors.push(`${dateStr}: เป็นวันหยุด ไม่สามารถกรอกได้`)
      continue
    }
    // Hours range
    if (line.hours < 0 || line.hours > 8) {
      errors.push(`${dateStr}: ชั่วโมงต้องอยู่ระหว่าง 0-8`)
      continue
    }
    // Accumulate daily total (excluding leave hours)
    const lockedHours = leaveLocked.get(dateStr) ?? 0
    const prev = dailyTotals.get(dateStr) ?? 0
    const total = prev + line.hours
    if (lockedHours + total > 8) {
      errors.push(`${dateStr}: ชั่วโมงรวมเกิน 8 ชม./วัน (ลา ${lockedHours} ชม. + งาน ${total} ชม.)`)
      continue
    }
    dailyTotals.set(dateStr, total)
  }

  if (errors.length) return badRequest(errors.join(' | '))

  // ── Upsert work lines (leave lines are untouched) ─────────
  // Delete existing work lines first
  await supabase
    .from('timesheet_lines')
    .delete()
    .eq('timesheet_id', params.id)
    .eq('line_type', 'work')

  // Insert new work lines (skip 0-hour lines)
  const workLines = body.lines
    .filter(l => l.hours > 0)
    .map(l => ({
      timesheet_id: params.id,
      work_date:    l.work_date,
      job_id:       l.job_id,
      hours:        l.hours,
      line_type:    'work',
      remark:       l.remark ?? null,
      activity_code: l.activity_code ?? null,
    }))

  if (workLines.length) {
    const { error: insertErr } = await supabase
      .from('timesheet_lines')
      .insert(workLines)
    if (insertErr) return serverError(insertErr)
  }

  // Update timesheet status to draft + timestamp
  await supabase
    .from('timesheets')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  // Fetch updated timesheet (trigger already updated total_hours)
  const { data: updated } = await supabase
    .from('timesheets')
    .select('*, lines:timesheet_lines(*)')
    .eq('id', params.id)
    .single()

  await writeAuditLog({
    session, action: 'timesheet.saved', entity_type: 'timesheet',
    entity_id: params.id,
    new_data: { total_hours: updated?.total_hours, lines_count: workLines.length }, req,
  })

  return ok(updated)
}
