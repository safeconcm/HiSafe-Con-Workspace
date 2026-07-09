// src/app/api/hr/certificates/[id]/reissue/route.ts
// POST /api/hr/certificates/:id/reissue
// Voids the given certificate (if not already voided) and issues a fresh
// replacement with a new cert_no, same employee/type/purpose/salary-opt-in,
// re-snapshotting the employee's current position/department/hire_date
// (same snapshot logic as POST /api/hr/certificates) since those may have
// changed since the original was issued. The two rows are cross-linked
// (superseded_by_id on the old one, reissued_from_id on the new one) so the
// certificates list can show "reissued as ..." / "replaces ..." instead of
// just two unrelated rows.
//
// This is a single request rather than two separate client-side calls
// (void, then create) so a network failure between the two steps can never
// leave a certificate voided with no replacement issued.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound, serverError,
  writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()

  const { data: original } = await supabase
    .from('employment_certificates').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!original) return notFound('Certificate')

  const { data: user } = await supabase.from('users').select(
    'employee_code, first_name_th, last_name_th, department, position_th, hire_date'
  ).eq('id', original.user_id).single()
  if (!user) return badRequest('ไม่พบข้อมูลพนักงาน')

  let salaryAmount: number | null = null
  if (original.include_salary) {
    const { data: salRec } = await supabase.from('salary_records')
      .select('base_salary').eq('user_id', original.user_id)
      .order('effective_date', { ascending: false }).limit(1).single()
    salaryAmount = (salRec as any)?.base_salary ?? original.salary_amount ?? null
  }

  const year  = new Date().getFullYear()
  const { count } = await supabase.from('employment_certificates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', session.company_id)
    .gte('issued_date', `${year}-01-01`)
  const seqNo    = String((count ?? 0) + 1).padStart(4, '0')
  const compCode = session.company_id.slice(-4).toUpperCase()
  const cert_no  = `CERT-${compCode}-${year}-${seqNo}`

  const { data: reissued, error: insertErr } = await supabase
    .from('employment_certificates').insert({
      company_id:       session.company_id,
      user_id:          original.user_id,
      cert_no,
      cert_type:        original.cert_type,
      purpose:          original.purpose,
      issued_date:      new Date().toISOString().split('T')[0],
      issued_by_id:      session.id,
      position_th:      user.position_th ?? null,
      department:       user.department  ?? null,
      hire_date:        user.hire_date   ?? null,
      salary_amount:    salaryAmount,
      include_salary:   original.include_salary,
      reissued_from_id: original.id,
    })
    .select()
    .single()
  if (insertErr) return serverError(insertErr)

  // Only auto-void the original if it wasn't already voided for some other
  // reason — either way, link it forward to the replacement.
  const voidUpdate: Record<string, unknown> = { superseded_by_id: reissued.id }
  if (!original.is_voided) {
    voidUpdate.is_voided    = true
    voidUpdate.void_reason  = 'ออกใบรับรองใหม่แทนที่'
    voidUpdate.voided_by_id = session.id
    voidUpdate.voided_at    = new Date().toISOString()
  }
  const { error: voidErr } = await supabase
    .from('employment_certificates').update(voidUpdate).eq('id', original.id)
  if (voidErr) return serverError(voidErr)

  await writeAuditLog({
    session, action: 'certificate.reissued', entity_type: 'certificate',
    entity_id: reissued.id,
    old_data: original,
    new_data: { ...reissued, salary_amount: reissued.include_salary ? '[REDACTED]' : null },
    req,
  })

  return ok(reissued)
}
