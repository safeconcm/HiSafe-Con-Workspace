// src/app/api/leave/[id]/reject/route.ts
// POST /api/leave/:id/reject  — Supervisor rejects a leave request

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

  const body = await req.json().catch(() => ({}))
  const { rejection_reason } = body
  if (!rejection_reason?.trim()) return badRequest('กรุณาระบุเหตุผลในการไม่อนุมัติ')

  const supabase = createAdminSupabaseClient()
  const { data: leave } = await supabase
    .from('leave_requests').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()

  if (!leave) return notFound('Leave request')
  if (leave.status !== 'pending') return badRequest(`ไม่สามารถปฏิเสธใบลาในสถานะ "${leave.status}"`)
  if (leave.current_approver_id !== session.id) return forbidden()

  const year = new Date(leave.start_date).getFullYear()
  const now  = new Date().toISOString()

  // Update status
  await supabase.from('leave_requests').update({
    status:           'rejected',
    rejected_by_id:   session.id,
    rejected_at:      now,
    rejection_reason,
    current_approver_id: null,
  }).eq('id', params.id)

  // Release pending days (atomic)
  await supabase.rpc('decrement_pending_days', {
    p_user_id: leave.user_id, p_leave_type: leave.leave_type,
    p_year: year, p_days: leave.total_days,
  })

  // Record rejection
  await supabase.from('leave_approvals').insert({
    leave_request_id: params.id,
    approver_id:   session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action:        'rejected',
    comment:       rejection_reason,
    sequence:      1,
  })

  // Notify employee
  await dispatchNotifications({
    company_id:    session.company_id,
    recipient_ids: [leave.user_id],
    event_type:    'leave_rejected',
    title:         'ใบลาไม่ได้รับการอนุมัติ',
    body:          `ใบลา ${leave.total_days} วัน ไม่ได้รับอนุมัติ เหตุผล: ${rejection_reason}`,
    reference_id:  params.id,
    reference_type: 'leave_request',
  })

  await writeAuditLog({
    session, action: 'leave.rejected', entity_type: 'leave_request',
    entity_id: params.id, old_data: leave,
    new_data: { status: 'rejected', rejection_reason }, req,
  })

  return ok({ id: params.id, status: 'rejected' })
}
