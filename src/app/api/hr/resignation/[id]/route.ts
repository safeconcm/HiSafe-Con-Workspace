// src/app/api/hr/resignation/[id]/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.from('resignations')
    .select(`*, user:users!resignations_user_id_fkey(
      id, employee_code, first_name_th, last_name_th,
      department, position_th, hire_date, email
    )`)
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (error || !data) return notFound('Resignation')
  if (!isHROrAdmin(session) && data.user_id !== session.id) return forbidden()
  return ok(data)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase.from('resignations').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Resignation')

  const body    = await req.json().catch(() => ({}))
  const action  = body.action // 'acknowledge' | 'approve' | 'complete'
  const now     = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (action === 'acknowledge') {
    updates.status           = 'acknowledged'
    updates.acknowledged_by  = session.id
    updates.acknowledged_at  = now
  } else if (action === 'approve') {
    updates.status      = 'approved'
    updates.approved_by = session.id
    updates.approved_at = now
  } else if (action === 'complete') {
    updates.status          = 'completed'
    updates.clearance_done  = true
    updates.exit_interview  = body.exit_interview ?? null
    // Mark user as resigned
    await supabase.from('users').update({
      status:      'resigned',
      resign_date: existing.last_work_date,
    }).eq('id', existing.user_id)
    updates.certificate_issued = body.certificate_issued ?? false
  } else {
    // General update
    const allowed = ['clearance_items','clearance_done','exit_interview',
      'resignation_letter_url','notes','last_work_date']
    for (const k of allowed) if (k in body) updates[k] = body[k]
  }

  const { data, error } = await supabase.from('resignations')
    .update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: `resignation.${action ?? 'updated'}`,
    entity_type: 'resignation', entity_id: params.id,
    old_data: existing, new_data: data, req,
  })
  return ok(data)
}
