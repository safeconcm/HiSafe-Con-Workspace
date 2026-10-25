// src/app/api/hr/salary/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, isHROrAdmin, getAccessibleCompanyIds,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get('user_id')
  const status  = searchParams.get('status') // 'pending' | 'approved' | 'rejected' | omitted = all
  const page    = parseInt(searchParams.get('page')  ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')
  const from    = (page - 1) * limit
  const supabase = createAdminSupabaseClient()

  // 2026-10-26, cross-company read grant (Issue 2) — only widens the
  // HR/Admin branch below; the employee branch further filters by
  // user_id === session.id, so this is a no-op for them.
  const accessibleCompanyIds = await getAccessibleCompanyIds(session)

  let query = supabase
    .from('salary_records')
    .select(`
      *,
      user:users!salary_records_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, department
      ),
      approved_by:users!salary_records_approved_by_id_fkey(first_name_th, last_name_th),
      created_by_user:users!salary_records_created_by_fkey(first_name_th, last_name_th)
    `, { count: 'exact' })
    .in('company_id', accessibleCompanyIds)
    .order('effective_date', { ascending: false })
    .range(from, from + limit - 1)

  if (!isHROrAdmin(session)) query = query.eq('user_id', session.id)
  else if (user_id) query = query.eq('user_id', user_id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ records: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { user_id, effective_date, base_salary } = body
  if (!user_id || !effective_date || base_salary === undefined) {
    return badRequest('user_id, effective_date, base_salary required')
  }

  const supabase = createAdminSupabaseClient()

  // Calculate net salary
  const allowances  = body.allowances  ?? {}
  const deductions  = body.deductions  ?? {}
  const totalAllow  = Object.values(allowances).reduce((s: number, v: any) => s + Number(v), 0)
  const totalDeduct = Object.values(deductions).reduce((s: number, v: any) => s + Number(v), 0)
  const net_salary  = body.net_salary ?? (base_salary + totalAllow - totalDeduct)

  // 2026-10-20, "ข้อ 2" — HR submitting this no longer takes effect
  // immediately. It starts 'pending' (approved_by_id/approved_at stay null
  // until an Admin or org-root MD signs off via POST .../[id]/approve — see
  // that route and isSalaryApprover() in api-helpers.ts). payroll.ts only
  // ever reads status='approved' rows, so a pending row can't affect pay
  // until it's actually approved.
  const { data, error } = await supabase.from('salary_records').insert({
    company_id:    session.company_id,
    user_id,
    effective_date,
    salary_type:   body.salary_type ?? 'monthly',
    base_salary,
    allowances,
    deductions,
    net_salary,
    reason:        body.reason ?? null,
    status:        'pending',
    notes:         body.notes ?? null,
    created_by:    session.id,
  }).select().single()

  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'salary.requested', entity_type: 'salary_record',
    entity_id: data.id, new_data: { ...data, base_salary: '[REDACTED]' }, req,
  })
  return created(data)
}
