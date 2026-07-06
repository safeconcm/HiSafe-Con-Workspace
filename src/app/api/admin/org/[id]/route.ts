// src/app/api/admin/org/[id]/route.ts
// PATCH  /api/admin/org/:id — update parent / acting approver
// DELETE /api/admin/org/:id — deactivate node

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, notFound,
  serverError, writeAuditLog,
} from '@/lib/api-helpers'

type Ctx = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body    = await req.json().catch(() => ({}))
  const supabase = createAdminSupabaseClient()

  const { data: existing } = await supabase
    .from('organization_nodes').select('*').eq('id', params.id)
    .eq('company_id', session.company_id).single()
  if (!existing) return notFound('Org node')

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  // Recalculate depth if parent changes
  if ('parent_id' in body) {
    updates.parent_id = body.parent_id ?? null
    if (body.parent_id) {
      const { data: parent } = await supabase
        .from('organization_nodes').select('depth').eq('id', body.parent_id).single()
      updates.depth = (parent?.depth ?? -1) + 1
    } else {
      updates.depth = 0
    }
  }
  if ('acting_approver_id' in body) updates.acting_approver_id = body.acting_approver_id ?? null

  const { data: updated, error } = await supabase
    .from('organization_nodes').update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'org.updated', entity_type: 'organization_node',
    entity_id: params.id, old_data: existing, new_data: updated, req,
  })

  return ok(updated)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: node } = await supabase
    .from('organization_nodes').select('id')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!node) return notFound('Org node')

  await supabase.from('organization_nodes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  await writeAuditLog({
    session, action: 'org.deactivated', entity_type: 'organization_node',
    entity_id: params.id, req,
  })

  return ok({ id: params.id, deactivated: true })
}
