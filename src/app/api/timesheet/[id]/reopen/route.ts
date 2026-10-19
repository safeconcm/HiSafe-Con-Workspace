// src/app/api/timesheet/[id]/reopen/route.ts
// POST /api/timesheet/:id/reopen — reopens an already submitted/approved
// Timesheet back to 'draft' so the employee can fix a mistake, then resubmit
// through the normal submit → approve cycle.
//
// Added 2026-10-19, per request: once a Timesheet is submitted/approved
// there was no way to correct it at all — this matters more now that
// employees are explicitly allowed to pre-fill hours for days that haven't
// happened yet (e.g. days 26-31 before the end of the month), since a
// planned entry can turn out wrong after the fact (sudden sick leave,
// extra OT, a different Job). Deliberately reverts all the way to 'draft'
// (full resubmit + re-approve), not a special "editable while approved"
// state — matches the user's explicit choice over a faster partial-edit path.
//
// Who can reopen: HR/Admin, or specifically the supervisor who approved
// this timesheet (not just any supervisor company-wide) — also the user's
// explicit choice.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, writeAuditLog, dispatchNotifications,
  isHROrAdmin,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => ({}))
  if (!body.reason?.trim()) return badRequest('กรุณาระบุเหตุผลที่เปิดให้แก้ไข')

  const supabase = createAdminSupabaseClient()
  const { data: ts } = await supabase
    .from('timesheets')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!ts) return notFound('Timesheet')
  if (!['submitted', 'approved'].includes(ts.status)) {
    return badRequest(`ไม่สามารถเปิดแก้ไขได้ในสถานะ "${ts.status}"`)
  }

  const canReopen = isHROrAdmin(session) || (!!ts.approved_by_id && ts.approved_by_id === session.id)
  if (!canReopen) return forbidden()

  const now = new Date().toISOString()
  await supabase.from('timesheets').update({
    status:              'draft',
    current_approver_id: null,
    reopened_at:          now,
    reopened_by_id:       session.id,
    reopen_reason:        body.reason,
    updated_at:           now,
  }).eq('id', params.id)

  await supabase.from('timesheet_approvals').insert({
    timesheet_id:  params.id,
    approver_id:   session.id,
    approver_name: `${session.first_name_th} ${session.last_name_th}`,
    action:        'reopened',
    comment:       body.reason,
    sequence:      99,
  })

  await dispatchNotifications({
    company_id:    session.company_id,
    recipient_ids: [ts.user_id],
    event_type:    'timesheet_reopened',
    title:         'Timesheet ถูกเปิดให้แก้ไขอีกครั้ง',
    body:          `Timesheet เดือน ${ts.month}/${ts.year} ของคุณถูกเปิดให้แก้ไขโดย ${session.first_name_th} — เหตุผล: ${body.reason}`,
    reference_id:  params.id,
    reference_type: 'timesheet',
  })

  await writeAuditLog({
    session, action: 'timesheet.reopened', entity_type: 'timesheet',
    entity_id: params.id, old_data: ts,
    new_data: { status: 'draft', reopen_reason: body.reason }, req,
  })

  return ok({ id: params.id, status: 'draft' })
}
