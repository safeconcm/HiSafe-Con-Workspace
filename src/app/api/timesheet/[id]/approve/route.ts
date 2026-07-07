// src/app/api/timesheet/[id]/approve/route.ts
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

  const { data: ts } = await supabase
    .from('timesheets')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!ts) return notFound('Timesheet')
  if (ts.status !== 'submitted') return badRequest(`ไม่สามารถอนุมัติในสถานะ "${ts.status}"`)
  if (ts.current_approver_id !== session.id) return forbidden()

  const now = new Date().toISOString()
  await supabase.from('timesheets').update({
    status:              'approved',
    approved_by_id:      session.id,
    approved_at:         now,
    current_approver_id: null,
    updated_at:          now,
  }).eq('id', params.id)

  await supabase.from('timesheet_approvals').insert({
    timesheet_id:  params.id,
    approver_id:   session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action:        'approved',
    comment,
    sequence:      1,
  })

  // Notify employee + HR
  const { data: hrUsers } = await supabase.from('users')
    .select('id').eq('company_id', session.company_id).in('role', ['hr', 'admin'])
  const hrIds = (hrUsers ?? []).map((u: any) => u.id)

  await dispatchNotifications({
    company_id:    session.company_id,
    recipient_ids: [ts.user_id],
    event_type:    'timesheet_approved',
    title:         'Timesheet ได้รับการอนุมัติ',
    body:          `Timesheet เดือน ${ts.month}/${ts.year} ได้รับการอนุมัติจาก ${session.first_name_th}`,
    reference_id:  params.id,
    reference_type: 'timesheet',
  })

  if (hrIds.length) {
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: hrIds,
      event_type:    'timesheet_approved',
      title:         'Timesheet อนุมัติแล้ว',
      body:          `Timesheet ของพนักงาน เดือน ${ts.month}/${ts.year} อนุมัติแล้ว`,
      reference_id:  params.id,
      reference_type: 'timesheet',
    })
  }

  await writeAuditLog({
    session, action: 'timesheet.approved', entity_type: 'timesheet',
    entity_id: params.id, old_data: ts,
    new_data: { status: 'approved', approved_by_id: session.id }, req,
  })

  return ok({ id: params.id, status: 'approved' })
}
