// src/app/api/admin/jobs/[id]/route.ts
// PATCH  /api/admin/jobs/:id — edit job / toggle status
// DELETE /api/admin/jobs/:id — soft delete (set status=closed)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog,
} from '@/lib/api-helpers'

type Ctx = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('jobs').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Job')

  const body = await req.json().catch(() => ({}))
  const allowed = ['job_code', 'name_th', 'name_en', 'status', 'description', 'client_name']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data: updated, error } = await supabase
    .from('jobs').update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'job.updated', entity_type: 'job',
    entity_id: params.id, old_data: existing, new_data: updated, req,
  })

  return ok(updated)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()

  // Check not used in any timesheet line
  const { count } = await supabase
    .from('timesheet_lines').select('id', { count: 'exact', head: true })
    .eq('job_id', params.id)
  if (count && count > 0) {
    return badRequest('ไม่สามารถลบได้ Job นี้มีข้อมูล Timesheet อยู่แล้ว กรุณาปิด (inactive) แทน')
  }

  await supabase.from('jobs')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', params.id).eq('company_id', session.company_id)

  await writeAuditLog({
    session, action: 'job.closed', entity_type: 'job', entity_id: params.id, req,
  })

  return ok({ id: params.id, status: 'closed' })
}
