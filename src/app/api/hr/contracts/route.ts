// src/app/api/hr/contracts/route.ts
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
  const status  = searchParams.get('status')
  const page    = parseInt(searchParams.get('page')  ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')
  const from    = (page - 1) * limit

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('contracts')
    .select(`
      *,
      user:users!contracts_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, department, position_th
      )
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  // Employee sees only own contracts
  if (!isHROrAdmin(session)) query = query.eq('user_id', session.id)
  else if (user_id) query = query.eq('user_id', user_id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ contracts: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { user_id, contract_type, start_date, base_salary, position_th, department } = body
  if (!user_id || !start_date || base_salary === undefined) {
    return badRequest('user_id, start_date, base_salary required')
  }

  const supabase = createAdminSupabaseClient()

  // Auto-generate contract number
  const year     = new Date(start_date).getFullYear()
  const { count } = await supabase.from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', session.company_id)
    .gte('created_at', `${year}-01-01`)
  const seqNo      = String((count ?? 0) + 1).padStart(4, '0')
  const compCode   = session.company_id.slice(-4).toUpperCase()
  const contract_no = `CT-${compCode}-${year}-${seqNo}`

  // Calculate probation end
  const probation_days = body.probation_days ?? 120
  const probEnd = new Date(start_date)
  probEnd.setDate(probEnd.getDate() + probation_days)

  const { data, error } = await supabase.from('contracts').insert({
    company_id:     session.company_id,
    user_id,
    contract_no,
    contract_type:  contract_type ?? 'permanent',
    status:         'draft',
    start_date,
    end_date:       body.end_date ?? null,
    position_th:    position_th ?? null,
    position_en:    body.position_en ?? null,
    department:     department ?? null,
    work_location:  body.work_location ?? null,
    probation_days,
    probation_end:  probEnd.toISOString().split('T')[0],
    base_salary,
    salary_type:    body.salary_type ?? 'monthly',
    overtime_rate:  body.overtime_rate ?? 1.5,
    allowances:     body.allowances ?? {},
    benefits:       body.benefits ?? [],
    notice_days:    body.notice_days ?? 30,
    notes:          body.notes ?? null,
    created_by:     session.id,
  }).select().single()

  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'contract.created', entity_type: 'contract',
    entity_id: data.id, new_data: data, req,
  })
  return created(data)
}
