// src/app/api/ot/[id]/approve/route.ts
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

  const body    = await req.json().catch(() => ({}))
  const supabase = createAdminSupabaseClient()

  const { data: ot } = await supabase.from('ot_requests').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!ot) return notFound('OT request')
  if (ot.status !== 'pending') return badRequest(`ไม่สามารถอนุมัติในสถานะ "${ot.status}"`)
  if (ot.current_approver_id !== session.id) return forbidden()

  const now = new Date().toISOString()
  await supabase.from('ot_requests').update({
    status: 'approved', approved_by_id: session.id, approved_at: now, current_approver_id: null,
  }).eq('id', params.id)

  await supabase.from('ot_approvals').insert({
    ot_request_id: params.id, approver_id: session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action: 'approved', comment: body.comment ?? null, sequence: 1,
  })

  await dispatchNotifications({
    company_id: session.company_id, recipient_ids: [ot.user_id],
    event_type: 'ot_approved', title: 'คำขอ OT ได้รับการอนุมัติ',
    body: `OT วันที่ ${ot.ot_date} จำนวน ${ot.total_hours} ชม. ได้รับการอนุมัติแล้ว`,
    reference_id: params.id, reference_type: 'ot_request',
  })

  await writeAuditLog({ session, action: 'ot.approved', entity_type: 'ot_request', entity_id: params.id, old_data: ot, req })
  return ok({ id: params.id, status: 'approved' })
}
