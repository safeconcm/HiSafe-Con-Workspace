// src/app/api/hr/salary/[id]/reject/route.ts
// POST /api/hr/salary/:id/reject — Admin or org-root (MD) rejects a pending
// salary adjustment (2026-10-20, "ข้อ 2"). No notification to the employee
// here — they were never told a change was pending, so there's nothing to
// walk back; HR sees the rejected status + reason on the salary page and
// can re-submit a corrected request.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isSalaryApprover,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!(await isSalaryApprover(session))) return forbidden()

  const body = await req.json().catch(() => ({}))

  const supabase = createAdminSupabaseClient()
  const { data: record } = await supabase
    .from('salary_records').select('*').eq('id', params.id).eq('company_id', session.company_id).maybeSingle()
  if (!record) return notFound('Salary record')
  if (record.status !== 'pending') return badRequest(`รายการนี้ถูก${record.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}ไปแล้ว`)

  const { data, error } = await supabase
    .from('salary_records')
    .update({ status: 'rejected', approved_by_id: session.id, approved_at: new Date().toISOString(), rejected_reason: body.reason ?? null })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'salary.rejected', entity_type: 'salary_record',
    entity_id: params.id, old_data: { status: 'pending' }, new_data: { ...data, base_salary: '[REDACTED]' }, req,
  })
  return ok(data)
}
