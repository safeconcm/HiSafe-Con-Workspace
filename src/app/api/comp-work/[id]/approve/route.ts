// src/app/api/comp-work/[id]/approve/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, dispatchNotifications, isSupervisorOrAbove,
} from '@/lib/api-helpers'
import { applyCompWorkApproval } from '@/lib/comp-work'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isSupervisorOrAbove(session)) return forbidden()

  const body    = await req.json().catch(() => ({}))
  const supabase = createAdminSupabaseClient()

  const { data: cw } = await supabase.from('comp_work_requests').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!cw) return notFound('Comp-work request')
  if (cw.status !== 'pending') return badRequest(`ไม่สามารถอนุมัติในสถานะ "${cw.status}"`)
  if (cw.current_approver_id !== session.id) return forbidden()

  const now = new Date().toISOString()
  await supabase.from('comp_work_requests').update({
    status: 'approved', approved_by_id: session.id, approved_at: now, current_approver_id: null,
  }).eq('id', params.id)

  await applyCompWorkApproval(supabase, cw)

  await supabase.from('comp_work_approvals').insert({
    comp_work_request_id: params.id, approver_id: session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action: 'approved', comment: body.comment ?? null, sequence: 1,
  })

  await dispatchNotifications({
    company_id: session.company_id, recipient_ids: [cw.user_id],
    event_type: 'comp_work_approved', title: 'คำขอทำงานชดเชยได้รับการอนุมัติ',
    body: `งานชดเชยวันที่ ${cw.work_date} จำนวน ${cw.hours} ชม. ได้รับการอนุมัติแล้ว`,
    reference_id: params.id, reference_type: 'comp_work_request',
  })

  await writeAuditLog({ session, action: 'comp_work.approved', entity_type: 'comp_work_request', entity_id: params.id, old_data: cw, req })
  return ok({ id: params.id, status: 'approved' })
}
