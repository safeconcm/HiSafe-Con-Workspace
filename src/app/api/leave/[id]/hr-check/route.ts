// src/app/api/leave/[id]/hr-check/route.ts
// POST /api/leave/:id/hr-check — HR's 2nd-step check/acknowledgment AFTER
// the supervisor has already approved (2026-07-14, per user request for a
// real 2-step approval mirroring the paper form's separate "ผู้ตรวจสอบ" and
// "ความเห็นของผู้บังคับบัญชา" signature blocks).
//
// Deliberately does NOT change leave_requests.status — it stays 'approved'
// exactly as it was the moment the supervisor approved it. This is a
// parallel administrative sign-off only, tracked via hr_checked_at/_by_id.
// Keeping status untouched means find_approver()'s parent-on-leave check
// and payroll.ts's unpaid-leave-during-probation query (both read
// status='approved' to mean "this leave is in effect") are completely
// unaffected — see the investigation notes before this feature shipped.
//
// 2026-07-14 (part 2): HR can now also record "ไม่อนุมัติ" (decision =
// 'rejected'), stored in the separate hr_decision column — per explicit
// user decision, this is a NOTE only. It still does NOT touch status,
// used_days, or payroll (the supervisor's approval already locked those
// in, and un-doing them after the fact was deliberately ruled out — same
// reasoning as leave/timesheet cancel being disabled post-approval). HR's
// disagreement is visible on the timeline/detail page and travels into
// hr_check_comment as the reason.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body     = await req.json().catch(() => ({}))
  const comment  = body.comment ?? null
  const decision: 'approved' | 'rejected' = body.decision === 'rejected' ? 'rejected' : 'approved'

  if (decision === 'rejected' && !comment?.trim()) {
    return badRequest('กรุณาระบุเหตุผลที่ไม่อนุมัติ')
  }

  const supabase = createAdminSupabaseClient()
  const { data: leave } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!leave) return notFound('Leave request')
  if (leave.status !== 'approved') {
    return badRequest(`ตรวจสอบได้เฉพาะใบลาที่หัวหน้างานอนุมัติแล้วเท่านั้น (สถานะปัจจุบัน "${leave.status}")`)
  }
  if (leave.hr_checked_at) {
    return badRequest('ใบลานี้ผ่านการตรวจสอบจาก HR แล้ว')
  }

  const now = new Date().toISOString()

  // Self-service e-signature — same pattern as the supervisor's approve
  // step: whoever clicks "รับทราบ" signs with their own saved signature
  // from Profile > ลายเซ็นดิจิทัลของฉัน, right here.
  const { data: signer } = await supabase
    .from('users').select('signature_url').eq('id', session.id).single()

  await supabase.from('leave_requests').update({
    hr_checked_by_id:  session.id,
    hr_checked_at:      now,
    hr_check_comment:   comment,
    hr_decision:        decision,
    signature_hr_url:   signer?.signature_url ?? null,
  }).eq('id', params.id)

  await supabase.from('leave_approvals').insert({
    leave_request_id: params.id,
    approver_id:       session.id,
    approver_name:     `${session.first_name_th} ${session.last_name_th}`,
    action:            decision === 'rejected' ? 'hr_rejected' : 'noted',
    comment,
    sequence:          2,
  })

  await dispatchNotifications({
    company_id:     session.company_id,
    recipient_ids:  [leave.user_id],
    event_type:     'leave_hr_checked',
    title:          decision === 'rejected' ? 'HR มีข้อสังเกตเกี่ยวกับใบลาของคุณ' : 'ใบลาผ่านการตรวจสอบจาก HR แล้ว',
    body:           decision === 'rejected'
      ? `HR ตรวจสอบใบลาของคุณ ${leave.total_days} วัน (${leave.start_date} – ${leave.end_date}) แล้วมีข้อสังเกต: "${comment}" — ใบลานี้ยังคงมีผลตามที่หัวหน้างานอนุมัติ กรุณาติดต่อ HR หากมีข้อสงสัย`
      : `ใบลาของคุณ ${leave.total_days} วัน (${leave.start_date} – ${leave.end_date}) ผ่านการตรวจสอบจาก HR เรียบร้อยแล้ว`,
    reference_id:   params.id,
    reference_type: 'leave_request',
  })

  await writeAuditLog({
    session, action: 'leave.hr_checked', entity_type: 'leave_request',
    entity_id: params.id, old_data: leave,
    new_data: { hr_checked_by_id: session.id, hr_checked_at: now, hr_decision: decision }, req,
  })

  return ok({ id: params.id, hr_checked_at: now, hr_decision: decision })
}
