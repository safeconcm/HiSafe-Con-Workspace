// src/app/api/hr/certificates/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get('user_id')
  const page    = parseInt(searchParams.get('page')  ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')
  const from    = (page - 1) * limit
  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('employment_certificates')
    .select(`
      *,
      user:users!employment_certificates_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, department, position_th, hire_date
      ),
      issued_by:users!employment_certificates_issued_by_id_fkey(first_name_th, last_name_th)
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('issued_date', { ascending: false })
    .range(from, from + limit - 1)

  if (!isHROrAdmin(session)) query = query.eq('user_id', session.id)
  else if (user_id) query = query.eq('user_id', user_id)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ certificates: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { user_id, cert_type, purpose, include_salary } = body
  if (!user_id) return badRequest('user_id required')

  const supabase = createAdminSupabaseClient()

  // Get current user data snapshot
  const { data: user } = await supabase.from('users').select(
    'employee_code, first_name_th, last_name_th, department, position_th, hire_date'
  ).eq('id', user_id).single()
  if (!user) return badRequest('User not found')

  // Get latest salary if including salary
  let salaryAmount: number | null = null
  if (include_salary) {
    const { data: salRec } = await supabase.from('salary_records')
      .select('base_salary').eq('user_id', user_id)
      .order('effective_date', { ascending: false }).limit(1).single()
    salaryAmount = (salRec as any)?.base_salary ?? null
  }

  // Auto-generate cert number
  const year  = new Date().getFullYear()
  const { count } = await supabase.from('employment_certificates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', session.company_id)
    .gte('issued_date', `${year}-01-01`)
  const seqNo   = String((count ?? 0) + 1).padStart(4, '0')
  const compCode = session.company_id.slice(-4).toUpperCase()
  const cert_no  = `CERT-${compCode}-${year}-${seqNo}`

  const { data, error } = await supabase.from('employment_certificates').insert({
    company_id:     session.company_id,
    user_id,
    cert_no,
    cert_type:      cert_type  ?? 'employment',
    purpose:        purpose    ?? null,
    issued_date:    body.issued_date ?? new Date().toISOString().split('T')[0],
    issued_by_id:   session.id,
    // Snapshot of employee data at issuance
    position_th:    (user as any).position_th ?? null,
    department:     (user as any).department  ?? null,
    hire_date:      (user as any).hire_date   ?? null,
    salary_amount:  salaryAmount,
    include_salary: include_salary ?? false,
  }).select().single()

  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'certificate.issued', entity_type: 'certificate',
    entity_id: data.id, new_data: { ...data, salary_amount: include_salary ? '[REDACTED]' : null }, req,
  })
  return created(data)
}
