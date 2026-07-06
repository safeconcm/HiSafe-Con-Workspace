// src/app/api/hr/recruitment/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const type   = searchParams.get('type') ?? 'openings' // 'openings' | 'applicants'
  const status = searchParams.get('status')
  const job_id = searchParams.get('job_id')
  const page   = parseInt(searchParams.get('page')  ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '20')
  const from   = (page - 1) * limit
  const supabase = createAdminSupabaseClient()

  if (type === 'applicants') {
    let query = supabase.from('applicants')
      .select(`
        *,
        job_opening:job_openings(id, title_th, department)
      `, { count: 'exact' })
      .eq('company_id', session.company_id)
      .order('applied_date', { ascending: false })
      .range(from, from + limit - 1)
    if (status) query = query.eq('status', status)
    if (job_id) query = query.eq('job_opening_id', job_id)
    const { data, count, error } = await query
    if (error) return serverError(error)
    return ok({ applicants: data ?? [], total: count ?? 0, page })
  }

  // Job openings
  let query = supabase.from('job_openings')
    .select('*, applicant_count:applicants(count)', { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('open_date', { ascending: false })
    .range(from, from + limit - 1)
  if (status) query = query.eq('status', status)
  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ openings: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const supabase = createAdminSupabaseClient()
  const type = body.type ?? 'opening' // 'opening' | 'applicant'

  if (type === 'applicant') {
    const { first_name, last_name, job_opening_id } = body
    if (!first_name || !last_name) return badRequest('first_name, last_name required')

    const { data, error } = await supabase.from('applicants').insert({
      company_id:     session.company_id,
      job_opening_id: job_opening_id ?? null,
      first_name,
      last_name,
      email:          body.email ?? null,
      phone:          body.phone ?? null,
      resume_url:     body.resume_url ?? null,
      status:         body.status ?? 'screening',
      applied_date:   body.applied_date ?? new Date().toISOString().split('T')[0],
      notes:          body.notes ?? null,
    }).select().single()
    if (error) return serverError(error)
    await writeAuditLog({ session, action: 'applicant.created', entity_type: 'applicant', entity_id: data.id, req })
    return created(data)
  }

  // Create job opening
  const { title_th, headcount } = body
  if (!title_th) return badRequest('title_th required')

  const { data, error } = await supabase.from('job_openings').insert({
    company_id:       session.company_id,
    title_th,
    title_en:         body.title_en         ?? null,
    department:       body.department        ?? null,
    position_level:   body.position_level   ?? null,
    headcount:        headcount ?? 1,
    status:           'open',
    salary_min:       body.salary_min        ?? null,
    salary_max:       body.salary_max        ?? null,
    requirements:     body.requirements      ?? null,
    responsibilities: body.responsibilities  ?? null,
    benefits:         body.benefits          ?? null,
    work_location:    body.work_location     ?? null,
    contract_type:    body.contract_type     ?? 'permanent',
    open_date:        body.open_date ?? new Date().toISOString().split('T')[0],
    close_date:       body.close_date ?? null,
    created_by:       session.id,
  }).select().single()
  if (error) return serverError(error)
  await writeAuditLog({ session, action: 'job_opening.created', entity_type: 'job_opening', entity_id: data.id, req })
  return created(data)
}
