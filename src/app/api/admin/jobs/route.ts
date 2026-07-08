// src/app/api/admin/jobs/route.ts
// GET  /api/admin/jobs  — list jobs (all roles can read active)
// POST /api/admin/jobs  — create job (admin only)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, escapeForOrFilter,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year')   ?? String(new Date().getFullYear()))
  const status = searchParams.get('status') ?? 'active'
  const search = searchParams.get('q')

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('jobs')
    .select('id, job_code, name_th, name_en, year, status, client_name, description, created_at', { count: 'exact' })
    .eq('company_id', session.company_id)
    .eq('year', year)
    .order('job_code')

  if (status !== 'all') query = query.eq('status', status)
  if (search) {
    const s = escapeForOrFilter(search)
    query = query.or(`job_code.ilike.%${s}%,name_th.ilike.%${s}%`)
  }

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ jobs: data ?? [], total: count ?? 0, year })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body?.job_code || !body?.name_th) return badRequest('job_code and name_th required')

  const supabase = createAdminSupabaseClient()
  const year = body.year ?? new Date().getFullYear()

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      company_id:  session.company_id,
      job_code:    body.job_code.trim().toUpperCase(),
      name_th:     body.name_th.trim(),
      name_en:     body.name_en?.trim()     ?? null,
      year,
      status:      body.status              ?? 'active',
      description: body.description?.trim() ?? null,
      client_name: body.client_name?.trim() ?? null,
      created_by:  session.id,
    })
    .select()
    .single()

  if (error) {
    if (error.message.includes('unique')) return badRequest(`Job code "${body.job_code}" มีในระบบแล้วสำหรับปี ${year}`)
    return serverError(error)
  }

  await writeAuditLog({
    session, action: 'job.created', entity_type: 'job',
    entity_id: data.id, new_data: data, req,
  })

  return created(data)
}
