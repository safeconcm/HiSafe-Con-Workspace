// src/app/api/hr/salary/[id]/approve/route.ts
// POST /api/hr/salary/:id/approve — Admin or org-root (MD) signs off a
// pending salary adjustment (2026-10-20, "ข้อ 2"). Only after this does
// payroll.ts's salary_records queries pick the row up (both filter on
// status='approved'). Also dispatches the "ข้อ 3" employee notification
// (in-app + email only — salary is sensitive, so intentionally left out of
// LINE_NOTIFY_EVENTS in api-helpers.ts).
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isSalaryApprover, dispatchNotifications,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!(await isSalaryApprover(session))) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: record } = await supabase
    .from('salary_records')
    .select('*, user:users!salary_records_user_id_fkey(id, first_name_th, last_name_th, email)')
    .eq('id', params.id).eq('company_id', session.company_id).maybeSingle()
  if (!record) return notFound('Salary record')
  if (record.status !== 'pending') return badRequest(`รายการนี้ถูก${record.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}ไปแล้ว`)

  const { data, error } = await supabase
    .from('salary_records')
    .update({ status: 'approved', approved_by_id: session.id, approved_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'salary.approved', entity_type: 'salary_record',
    entity_id: params.id, old_data: { status: 'pending' }, new_data: { ...data, base_salary: '[REDACTED]' }, req,
  })

  const u = record.user
  await dispatchNotifications({
    company_id:     session.company_id,
    recipient_ids:  [record.user_id],
    event_type:     'salary_adjusted',
    title:          'เงินเดือนของคุณได้รับการปรับแล้ว',
    body:           `เงินเดือนใหม่มีผลตั้งแต่วันที่ ${record.effective_date}${record.reason ? ` (${record.reason})` : ''} — ดูรายละเอียดได้ที่หน้าประวัติเงินเดือน`,
    reference_id:   params.id,
    reference_type: 'salary_record',
  })

  return ok(data)
}
