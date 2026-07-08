// src/app/api/hr/contracts/[id]/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isHROrAdmin, dispatchNotifications,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('contracts')
    .select(`*, user:users!contracts_user_id_fkey(
      id, employee_code, first_name_th, last_name_th,
      department, position_th, hire_date, email, phone
    )`)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !data) return notFound('Contract')
  if (!isHROrAdmin(session) && data.user_id !== session.id) return forbidden()
  return ok(data)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase.from('contracts').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Contract')

  const body    = await req.json().catch(() => ({}))
  const allowed = [
    'status','position_th','position_en','department','work_location',
    'base_salary','salary_type','allowances','benefits','overtime_rate',
    'notice_days','notes','end_date','probation_days','probation_end',
    'signed_by_employee','signed_by_hr','file_url',
    'probation_status','probation_reminder_sent_at',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) updates[k] = body[k]

  // Set signed_at when both parties sign
  if (body.signed_by_employee && body.signed_by_hr) {
    updates.signed_at = new Date().toISOString()
    updates.status    = 'active'
  }

  const { data, error } = await supabase.from('contracts')
    .update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  // If activated → also update user's position/department
  if (updates.status === 'active') {
    await supabase.from('users').update({
      position_th: data.position_th ?? undefined,
      department:  data.department  ?? undefined,
    }).eq('id', data.user_id)
  }

  // Probation resolved (HR clicked confirm) → notify the employee, quoting
  // the MD's sign-off comment if one was recorded via probation_evaluations.
  if (typeof updates.probation_status === 'string' && updates.probation_status !== existing.probation_status) {
    const { data: mdEval } = await supabase
      .from('probation_evaluations')
      .select('comments, evaluator_id, evaluator:users!probation_evaluations_evaluator_id_fkey(first_name_th, last_name_th)')
      .eq('contract_id', params.id)
      .eq('evaluator_role', 'md')
      .maybeSingle()

    const RESULT_LABEL: Record<string, string> = {
      passed:   'ผ่านการทดลองงาน — บรรจุเป็นพนักงานประจำ',
      failed:   'ไม่ผ่านการทดลองงาน',
      extended: 'ขยายเวลาทดลองงาน',
    }
    const label = RESULT_LABEL[updates.probation_status as string] ?? `อัปเดตสถานะทดลองงาน: ${updates.probation_status}`
    const mdName = (mdEval as any)?.evaluator
      ? `${(mdEval as any).evaluator.first_name_th} ${(mdEval as any).evaluator.last_name_th}`
      : null

    await dispatchNotifications({
      company_id:     session.company_id,
      recipient_ids:  [data.user_id],
      event_type:     'general',
      title:          'ผลการประเมินทดลองงาน',
      body:           mdName
        ? `${label}\nลงนามโดย ${mdName} (MD)${(mdEval as any)?.comments ? `\nความเห็น: ${(mdEval as any).comments}` : ''}`
        : label,
      reference_id:   params.id,
    })
  }

  await writeAuditLog({
    session, action: `contract.${updates.status ?? 'updated'}`,
    entity_type: 'contract', entity_id: params.id,
    old_data: existing, new_data: data, req,
  })
  return ok(data)
}
