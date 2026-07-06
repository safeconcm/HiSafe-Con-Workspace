// src/app/api/hr/salary/route.ts
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
    .from('salary_records')
    .select(`
      *,
      user:users!salary_records_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, department
      ),
      approved_by:users!salary_records_approved_by_id_fkey(first_name_th, last_name_th)
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('effective_date', { ascending: false })
    .range(from, from + limit - 1)

  if (!isHROrAdmin(session)) query = query.eq('user_id', session.id)
  else if (user_id) query = query.eq('user_id', user_id)

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
    approved_by_id: session.id,
    approved_at:   new Date().toISOString(),
    notes:         body.notes ?? null,
    created_by:    session.id,
  }).select().single()

  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'salary.recorded', entity_type: 'salary_record',
    entity_id: data.id, new_data: { ...data, base_salary: '[REDACTED]' }, req,
  })
  return created(data)
}
