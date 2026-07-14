// src/app/api/timesheet/[id]/cancel/route.ts
// POST /api/timesheet/:id/cancel — employee withdraws their own timesheet
// while it's still waiting for approval (2026-07-13, per user request
// "Timesheet ควรมีกดยกเลิกได้").
//
// Only allowed from status 'submitted' (pending, not yet approved/rejected)
// — reverts it straight back to 'draft' so the employee can edit and
// resubmit, same as if it had been rejected. Deliberately does NOT cover an
// already-'approved' timesheet: that may already be reflected in payroll,
// so undoing it needs a deliberate decision (mirrors leave's
// approved -> cancel_pending re-approval flow) rather than a silent
// self-service cancel — left out of this pass on purpose.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, writeAuditLog, dispatchNotifications,
} from '@/lib/api-helpers'

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
  if (ts.status !== 'submitted') {
    return badRequest(`ไม่สามารถยกเลิกได้ในสถานะ "${ts.status}" — ยกเลิกได้เฉพาะที่รออนุมัติเท่านั้น`)
  }

  const previousApproverId = ts.current_approver_id

  const now = new Date().toISOString()
  await supabase.from('timesheets').update({
    status:              'draft',
    submitted_at:        null,
    current_approver_id: null,
    updated_at:          now,
  }).eq('id', params.id)

  await supabase.from('timesheet_approvals').insert({
    timesheet_id:  params.id,
    approver_id:   session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action:        'cancelled',
    comment:       'พนักงานยกเลิกการส่งอนุมัติด้วยตนเอง',
    sequence:      1,
  })

  // Let the assigned approver know it's no longer waiting on them, so it
  // doesn't sit confusingly in their queue — best-effort, doesn't block the
  // cancel itself.
  if (previousApproverId) {
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: [previousApproverId],
      event_type:    'timesheet_cancelled',
      title:         'Timesheet ถูกยกเลิกโดยผู้ส่ง',
      body:          `${session.first_name_th} ${session.last_name_th} ยกเลิก Timesheet เดือน ${ts.month}/${ts.year} ที่ส่งมาก่อนหน้านี้`,
      reference_id:  params.id,
      reference_type: 'timesheet',
    })
  }

  await writeAuditLog({
    session, action: 'timesheet.cancelled', entity_type: 'timesheet',
    entity_id: params.id, old_data: ts, new_data: { status: 'draft' }, req,
  })

  return ok({ id: params.id, status: 'draft' })
}
