// src/app/api/hr/announcements/[id]/route.ts
// DELETE — remove an announcement from "จัดการอัปเดต" (HR/Admin only).
//
// Default behavior (2026-07-13, revised): announcements are ONE shared row
// per company (company_ids array), not a per-user copy — so the original
// version of this route, which set deleted_at unconditionally, removed the
// announcement from EVERY employee's "อัปเดต" feed the moment any single
// admin clicked delete. Per user feedback ("อยากให้ลบเฉพาะของ SC-ADMIN เอง
// ได้ไหม"), the default is now scoped to the acting admin only: their id is
// added to hidden_for_admin_ids, which just removes it from THEIR OWN
// "จัดการอัปเดต" list. Employees and other admins are completely
// unaffected — this never touches deleted_at by default.
//
// Pass `{ retract_for_all: true }` in the request body to ALSO set
// deleted_at — a real, global retraction that removes it from every
// employee's "อัปเดต" feed too (the old behavior), for cases where the
// content genuinely needs to be pulled for everyone. The "จัดการอัปเดต" UI
// surfaces this as an opt-in checkbox in the delete confirmation, off by
// default.
//
// Deliberately does NOT touch the `notifications` table either way — a
// retracted announcement disappears from the ongoing ประกาศ/อัปเดต list
// going forward, but each user's already-received in-app/email/LINE
// notification stays in their own history untouched (per user request:
// "ลบแค่เฉพาะในระบบก่อนก็ได้... เดี๋ยวมันนิ่งแล้ว ค่อยแจ้งลบ...ล้างนับ 1
// ทีเดียว" — a one-time bulk reset once the system stabilizes is a
// separate, later, manual action, not something this endpoint does).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, notFound, serverError,
  writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const payload = await req.json().catch(() => null)
  const retractForAll = payload?.retract_for_all === true

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('announcements')
    .select('id, title, company_ids, hidden_for_admin_ids')
    .eq('id', params.id)
    .contains('company_ids', [session.company_id])
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) return notFound('Announcement')

  const hidden = new Set<string>((existing as any).hidden_for_admin_ids ?? [])
  hidden.add(session.id)
  const updates: Record<string, unknown> = { hidden_for_admin_ids: Array.from(hidden) }
  if (retractForAll) updates.deleted_at = new Date().toISOString()

  const { error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', params.id)
  if (error) return serverError(error)

  await writeAuditLog({
    session,
    action: retractForAll ? 'announcement.retracted' : 'announcement.hidden',
    entity_type: 'announcement',
    entity_id: params.id, old_data: { title: existing.title }, req,
  })

  return ok({ id: params.id, deleted: true, retracted_for_all: retractForAll })
}
