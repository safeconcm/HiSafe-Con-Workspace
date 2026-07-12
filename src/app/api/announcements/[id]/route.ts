// src/app/api/announcements/[id]/route.ts
// DELETE /api/announcements/:id — hide an announcement from the current
// (any role) user's own "อัปเดต" list (2026-07-13, per user request:
// "ทำปุ่มลบใน 'อัปเดต' แบบเดียวกับปุ่มลบใน 'จัดการอัปเดต' ทุก user").
//
// Same hide-only mechanism as the HR/Admin route
// (/api/hr/announcements/[id]) — adds the caller's id to
// hidden_for_user_ids, which only ever affects what THIS user sees going
// forward. No other user's visibility changes. Unlike the HR/Admin route,
// there is deliberately NO retract_for_all option here — a regular
// employee can hide the announcement from their own feed, but only
// HR/Admin can retract it for the whole company (that stays in the
// /api/hr/announcements routes, gated by isHROrAdmin).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, notFound, serverError,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('announcements')
    .select('id, hidden_for_user_ids')
    .eq('id', params.id)
    .contains('company_ids', [session.company_id])
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) return notFound('Announcement')

  const hidden = new Set<string>((existing as any).hidden_for_user_ids ?? [])
  hidden.add(session.id)

  const { error } = await supabase
    .from('announcements')
    .update({ hidden_for_user_ids: Array.from(hidden) })
    .eq('id', params.id)
  if (error) return serverError(error)

  return ok({ id: params.id, hidden: true })
}
