// src/app/api/timesheet/[id]/submit/route.ts
// POST /api/timesheet/:id/submit — employee submits timesheet for approval

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog, dispatchNotifications,
} from '@/lib/api-helpers'
import { getEffectiveSubmitDeadlineDay } from '@/lib/work-schedule'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  const { data: ts } = await supabase
    .from('timesheets')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!ts) return notFound('Timesheet')
  if (ts.user_id !== session.id) return forbidden()
  if (!['draft', 'rejected'].includes(ts.status)) {
    return badRequest(`ไม่สามารถส่งได้ในสถานะ "${ts.status}"`)
  }

  // Hard submission deadline (2026-10-19, per request: "บล็อกส่งจริงหลังเที่ยง
  // วันที่ 25") — 12:00 น. ไทย on the 25th, rolled back to the nearest
  // working day if the 25th falls on a company holiday/day off (see
  // getEffectiveSubmitDeadlineDay). Only enforced on a timesheet that has
  // never been through the submit cycle before (no row in
  // timesheet_approvals yet) — once it's been submitted at least once, even
  // if later rejected/cancelled/reopened for a correction, the deadline no
  // longer blocks a resubmission. Checked via history instead of
  // `submitted_at` because /cancel already nulls that field on a
  // self-withdrawn submission, which would otherwise make a legitimate
  // same-cycle resubmit look like a fresh late one.
  const { count: priorActionCount } = await supabase
    .from('timesheet_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('timesheet_id', params.id)

  if (!priorActionCount) {
    const deadlineDay = await getEffectiveSubmitDeadlineDay(supabase, session.company_id, ts.year, ts.month)
    const deadline = new Date(Date.UTC(ts.year, ts.month - 1, deadlineDay, 5, 0, 0)) // 12:00 น. ไทย = 05:00 UTC
    if (new Date() > deadline) {
      return badRequest(
        `เลยกำหนดส่ง Timesheet เดือน ${ts.month}/${ts.year} แล้ว (ตัดส่งวันที่ ${deadlineDay} เวลา 12:00 น.) กรุณาติดต่อ HR`
      )
    }
  }

  // Must have at least some hours
  const { count } = await supabase
    .from('timesheet_lines')
    .select('id', { count: 'exact', head: true })
    .eq('timesheet_id', params.id)
    .eq('line_type', 'work')
    .gt('hours', 0)

  if (!count || count === 0) {
    return badRequest('ต้องกรอกชั่วโมงงานอย่างน้อย 1 วันก่อนส่ง')
  }

  // Find approver (same org-tree logic as leave)
  const { data: approverId } = await supabase
    .rpc('find_approver', {
      p_user_id:    session.id,
      p_start_date: `${ts.year}-${String(ts.month).padStart(2,'0')}-01`,
      // Use actual last day of month (handles Feb, 30-day months correctly)
      p_end_date:   new Date(ts.year, ts.month, 0).toISOString().split('T')[0],
    })

  const now = new Date().toISOString()
  await supabase.from('timesheets').update({
    status:              'submitted',
    submitted_at:        now,
    current_approver_id: approverId ?? null,
    updated_at:          now,
  }).eq('id', params.id)

  // Auto-approve if no approver (CEO)
  if (!approverId) {
    await supabase.from('timesheets').update({
      status:         'approved',
      approved_by_id: null,
      approved_at:    now,
      current_approver_id: null,
    }).eq('id', params.id)

    await supabase.from('timesheet_approvals').insert({
      timesheet_id:  params.id,
      approver_id:   null,
      approver_name: 'ระบบ (Auto)',
      action:        'auto_approved',
      comment:       'ไม่มีผู้อนุมัติ — อนุมัติอัตโนมัติ',
      sequence:      99,
    })

    // Notify HR
    const { data: hrUsers } = await supabase.from('users')
      .select('id').eq('company_id', session.company_id).in('role', ['hr', 'admin'])
    const hrIds = (hrUsers ?? []).map((u: any) => u.id)
    if (hrIds.length) {
      await dispatchNotifications({
        company_id:    session.company_id,
        recipient_ids: hrIds,
        event_type:    'timesheet_approved',
        title:         'Timesheet อนุมัติอัตโนมัติ (CEO)',
        body:          `Timesheet ของ ${session.first_name_th} เดือน ${ts.month}/${ts.year} อนุมัติอัตโนมัติ`,
        reference_id:  params.id,
        reference_type: 'timesheet',
      })
    }
  } else {
    // Notify approver — unchanged, existing "needs your action" notification.
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: [approverId],
      event_type:    'timesheet_submitted',
      title:         'มี Timesheet รออนุมัติ',
      body:          `${session.first_name_th} ${session.last_name_th} ส่ง Timesheet เดือน ${ts.month}/${ts.year}`,
      reference_id:  params.id,
      reference_type: 'timesheet',
    })

    // Also notify the submitter with a "pending approval" confirmation —
    // separate call so the approver's message above is untouched. Added
    // per user request 2026-07-12 (same pattern as leave submission).
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: [session.id],
      event_type:    'timesheet_submitted',
      title:         'ส่ง Timesheet สำเร็จ รออนุมัติ',
      body:          `Timesheet เดือน ${ts.month}/${ts.year} ของคุณถูกส่งแล้ว สถานะ: รออนุมัติ`,
      reference_id:  params.id,
      reference_type: 'timesheet',
    })
  }

  await writeAuditLog({
    session, action: 'timesheet.submitted', entity_type: 'timesheet',
    entity_id: params.id,
    new_data: { status: 'submitted', approver_id: approverId }, req,
  })

  return ok({ id: params.id, status: approverId ? 'submitted' : 'approved' })
}
