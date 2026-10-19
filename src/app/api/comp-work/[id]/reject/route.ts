// src/app/api/comp-work/[id]/reject/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, dispatchNotifications, isSupervisorOrAbove,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isSupervisorOrAbove(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  if (!body.rejection_reason?.trim()) return badRequest('กรุณาระบุเหตุผล')

  const supabase = createAdminSupabaseClient()
  const { data: cw } = await supabase.from('comp_work_requests').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!cw) return notFound('Comp-work request')
  if (cw.status !== 'pending') return badRequest('ไม่สามารถปฏิเสธในสถานะนี้')
  if (cw.current_approver_id !== session.id) return forbidden()

  await supabase.from('comp_work_requests').update({
    status: 'rejected', rejected_by_id: session.id,
    rejected_at: new Date().toISOString(), rejection_reason: body.rejection_reason,
    current_approver_id: null,
  }).eq('id', params.id)

  await supabase.from('comp_work_approvals').insert({
    comp_work_request_id: params.id, approver_id: session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action: 'rejected', comment: body.rejection_reason, sequence: 1,
  })

  await dispatchNotifications({
    company_id: session.company_id, recipient_ids: [cw.user_id],
    event_type: 'comp_work_rejected', title: 'คำขอทำงานชดเชยไม่ได้รับการอนุมัติ',
    body: `งานชดเชยวันที่ ${cw.work_date} ไม่ได้รับอนุมัติ เหตุผล: ${body.rejection_reason}`,
    reference_id: params.id, reference_type: 'comp_work_request',
  })

  await writeAuditLog({ session, action: 'comp_work.rejected', entity_type: 'comp_work_request', entity_id: params.id, req })
  return ok({ id: params.id, status: 'rejected' })
}
