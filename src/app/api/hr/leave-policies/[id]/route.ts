// src/app/api/hr/leave-policies/[id]/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, notFound, serverError,
  writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('leave_policies').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Leave policy')

  const body    = await req.json().catch(() => ({}))
  const allowed = ['quota_days','carry_forward_max','allow_half_day','require_document_after_days','min_days_notice','description_th']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data: updated, error } = await supabase
    .from('leave_policies').update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'leave_policy.updated', entity_type: 'leave_policy',
    entity_id: params.id, old_data: existing, new_data: updated, req,
  })

  return ok(updated)
}
