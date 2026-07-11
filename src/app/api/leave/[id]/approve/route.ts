// src/app/api/leave/[id]/approve/route.ts
// POST /api/leave/:id/approve  — Supervisor approves a leave request

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog, dispatchNotifications,
  isSupervisorOrAbove,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isSupervisorOrAbove(session)) return forbidden()

  const body    = await req.json().catch(() => ({}))
  const comment = body.comment ?? null

  const supabase = createAdminSupabaseClient()

  // Fetch leave request
  const { data: leave } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!leave) return notFound('Leave request')
  if (leave.status !== 'pending' && leave.status !== 'cancel_pending') {
    return badRequest(`ไม่สามารถอนุมัติใบลาในสถานะ "${leave.status}"`)
  }
  if (leave.current_approver_id !== session.id) {
    return forbidden()  // Not assigned to this approver
  }

  const now = new Date().toISOString()
  const year = new Date(leave.start_date).getFullYear()

  if (leave.status === 'cancel_pending') {
    // Approve the cancellation
    await supabase.from('leave_requests').update({
      status: 'cancelled', cancelled_at: now, current_approver_id: null,
    }).eq('id', params.id)

    // Refund used_days back to balance
    const { data: bal } = await supabase.from('leave_balances')
      .select('used_days').eq('user_id', leave.user_id)
      .eq('leave_type', leave.leave_type).eq('year', year).single()
    if (bal) {
      await supabase.from('leave_balances').update({
        used_days: Math.max((bal.used_days ?? 0) - leave.total_days, 0),
      }).eq('user_id', leave.user_id).eq('leave_type', leave.leave_type).eq('year', year)
    }

    // Remove timesheet leave lines for this request
    await supabase.from('timesheet_lines')
      .delete()
      .eq('leave_request_id', params.id)
      .eq('line_type', 'leave')

  } else {
    // Normal approve — self-service e-signature: clicking "อนุมัติ" IS the
    // signing step now (no separate signing action afterward, and no
    // distinct "HR" signer — whoever approves signs with their own saved
    // signature from Profile > ลายเซ็นดิจิทัลของฉัน, right here, in this
    // same request). If the approver hasn't saved a signature yet, the
    // approval still goes through — the signature block just stays blank
    // until they set one up.
    const { data: signer } = await supabase
      .from('users').select('signature_url').eq('id', session.id).single()

    await supabase.from('leave_requests').update({
      status:             'approved',
      approved_by_id:     session.id,
      approved_at:        now,
      current_approver_id: null,
      signature_approver_url: signer?.signature_url ?? null,
      signature_approver_at:  signer?.signature_url ? now : null,
    }).eq('id', params.id)

    // Move pending_days → used_days (atomic)
    await supabase.rpc('decrement_pending_days', {
      p_user_id: leave.user_id, p_leave_type: leave.leave_type,
      p_year: year, p_days: leave.total_days,
    })
    // Increment used_days atomically
    const { data: balRow } = await supabase.from('leave_balances')
      .select('used_days')
      .eq('user_id', leave.user_id)
      .eq('leave_type', leave.leave_type)
      .eq('year', year)
      .single()
    if (balRow) {
      await supabase.from('leave_balances')
        .update({ used_days: ((balRow as any).used_days ?? 0) + leave.total_days })
        .eq('user_id', leave.user_id)
        .eq('leave_type', leave.leave_type)
        .eq('year', year)
    }

    // Lock timesheet dates
    await supabase.rpc('lock_timesheet_for_leave', { p_leave_request_id: params.id })
  }

  // Record approval action
  await supabase.from('leave_approvals').insert({
    leave_request_id: params.id,
    approver_id:      session.id,
    approver_name:    `${session.first_name_th} ${session.last_name_th}`,
    action:           'approved',
    comment,
    sequence:         1,
  })

  // Notify employee
  await dispatchNotifications({
    company_id:    session.company_id,
    recipient_ids: [leave.user_id],
    event_type:    'leave_approved',
    title:         'ใบลาได้รับการอนุมัติ',
    body:          `ใบลาของคุณ ${leave.total_days} วัน (${leave.start_date} – ${leave.end_date}) ได้รับการอนุมัติแล้ว`,
    reference_id:  params.id,
    reference_type: 'leave_request',
  })

  // Notify HR
  const { data: hrUsers } = await supabase.from('users')
    .select('id').eq('company_id', session.company_id).in('role', ['hr', 'admin'])
  const hrIds = (hrUsers ?? []).map((u: any) => u.id).filter((id: string) => id !== leave.user_id)
  if (hrIds.length) {
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: hrIds,
      event_type:    'leave_approved',
      title:         'ใบลาได้รับการอนุมัติ',
      body:          `ใบลาของ ${leave.user_id} ได้รับการอนุมัติโดย ${session.first_name_th}`,
      reference_id:  params.id,
      reference_type: 'leave_request',
    })
  }

  await writeAuditLog({
    session, action: 'leave.approved', entity_type: 'leave_request',
    entity_id: params.id, old_data: leave,
    new_data: { ...leave, status: 'approved', approved_by_id: session.id }, req,
  })

  return ok({ id: params.id, status: 'approved' })
}
