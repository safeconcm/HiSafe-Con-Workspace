// src/app/api/hr/job-applications/[id]/route.ts
// GET  — full applicant detail (with signed URLs for uploaded files)
// PATCH — update status + the internal "การพิจารณาว่าจ้าง" hiring section

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, notFound, badRequest, unauthorized, forbidden,
  serverError, isHROrAdmin, writeAuditLog,
} from '@/lib/api-helpers'

const SIGNED_URL_TTL = 60 * 10 // 10 minutes — detail page is viewed then closed

const FILE_COLUMNS = ['photo_url', 'id_card_copy_url', 'house_reg_copy_url', 'education_cert_url'] as const

async function signFileColumns(supabase: ReturnType<typeof createAdminSupabaseClient>, row: any) {
  const signed: Record<string, string | null> = {}
  for (const col of FILE_COLUMNS) {
    const path = row[col]
    if (!path) { signed[col] = null; continue }
    const { data } = await supabase.storage.from('job-applications').createSignedUrl(path, SIGNED_URL_TTL)
    signed[col] = data?.signedUrl ?? null
  }
  return { ...row, ...signed }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()
  const { id } = await params

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('job_applications').select('*, company:companies(code, name_th, logo_url)')
    .eq('id', id).eq('company_id', session.company_id)
    .single()

  if (error || !data) return notFound('ใบสมัคร')

  return ok(await signFileColumns(supabase, data))
}

const EDITABLE_FIELDS = [
  'status',
  'hire_position', 'hire_department', 'hire_salary', 'hire_start_date',
  'hire_allowances', 'hire_supervised_by', 'interviewer_name', 'interview_date',
  'hr_reviewer_name', 'hr_review_date', 'approver_name', 'approver_date', 'hr_notes',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field] === '' ? null : body[field]
  }
  if (Object.keys(patch).length === 1) return badRequest('ไม่มีข้อมูลที่แก้ไข')

  if ('status' in patch) {
    patch.reviewed_by = session.id
    patch.reviewed_at = new Date().toISOString()
  }

  const supabase = createAdminSupabaseClient()
  const { data: before } = await supabase.from('job_applications').select('status').eq('id', id).eq('company_id', session.company_id).single()
  if (!before) return notFound('ใบสมัคร')

  const { data, error } = await supabase
    .from('job_applications').update(patch)
    .eq('id', id).eq('company_id', session.company_id)
    .select('*, company:companies(code, name_th, logo_url)').single()

  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'job_application.updated', entity_type: 'job_application', entity_id: id,
    old_data: before, new_data: patch, req,
  })

  return ok(await signFileColumns(supabase, data))
}
