// src/app/api/hr/onboarding/[id]/route.ts
// PATCH /api/hr/onboarding/:id — toggle one checklist item, or mark the
// whole checklist complete.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('onboarding_checklists').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Onboarding checklist')

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (body.toggle_key) {
    // Flip a single item's done state — the common case (HR checking one
    // box at a time), avoids the client having to resend the whole array.
    const items = (existing.items as any[]).map(item =>
      item.key === body.toggle_key
        ? {
            ...item,
            done:    !item.done,
            done_by: !item.done ? session.id : null,
            done_at: !item.done ? now : null,
          }
        : item
    )
    updates.items = items
  } else if (Array.isArray(body.items)) {
    updates.items = body.items
  }

  if (body.action === 'complete') {
    updates.status       = 'completed'
    updates.completed_at = now
  } else if (body.action === 'reopen') {
    updates.status       = 'in_progress'
    updates.completed_at = null
  }

  const { data, error } = await supabase
    .from('onboarding_checklists')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'onboarding_checklist.updated', entity_type: 'onboarding_checklist',
    entity_id: params.id, old_data: existing, new_data: data, req,
  })
  return ok(data)
}
