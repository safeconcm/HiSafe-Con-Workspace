// src/app/api/timesheet/[id]/reject/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, writeAuditLog, dispatchNotifications,
  isSupervisorOrAbove,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isSupervisorOrAbove(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  if (!body.rejection_reason?.trim()) return badRequest('กรุณาระบุเหตุผล')

  const supabase = createAdminSupabaseClient()
  const { data: ts } = await supabase
    .from('timesheets').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()

  if (!ts) return notFound('Timesheet')
  if (ts.status !== 'submitted') return badRequest(`ไม่สามารถปฏิเสธในสถานะ "${ts.status}"`)
  if (ts.current_approver_id !== session.id) return forbidden()

  const now = new Date().toISOString()
  await supabase.from('timesheets').update({
    status:              'rejected',
    rejected_by_id:      session.id,
    rejected_at:         now,
    rejection_reason:    body.rejection_reason,
    current_approver_id: null,
    updated_at:          now,
  }).eq('id', params.id)

  await supabase.from('timesheet_approvals').insert({
    timesheet_id:  params.id,
    approver_id:   session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action:        'rejected',
    comment:       body.rejection_reason,
    sequence:      1,
  })

  await dispatchNotifications({
    company_id:    session.company_id,
    recipient_ids: [ts.user_id],
    event_type:    'timesheet_rejected',
    title:         'Timesheet ถูกส่งคืน',
    body:          `Timesheet เดือน ${ts.month}/${ts.year} ถูกส่งคืน เหตุผล: ${body.rejection_reason}`,
    reference_id:  params.id,
    reference_type: 'timesheet',
  })

  await writeAuditLog({
    session, action: 'timesheet.rejected', entity_type: 'timesheet', entity_id: params.id,
    old_data: ts, new_data: { status: 'rejected', rejection_reason: body.rejection_reason }, req,
  })

  return ok({ id: params.id, status: 'rejected' })
}
