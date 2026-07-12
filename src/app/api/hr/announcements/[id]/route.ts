// src/app/api/hr/announcements/[id]/route.ts
// DELETE — soft-delete an announcement (HR/Admin only). Sets deleted_at
// instead of removing the row, so it can be restored if deleted by
// mistake (still in testing phase as of 2026-07-12, when this was added —
// announcements were piling up with no way to clean up test posts).
// Deliberately does NOT touch the `notifications` table — a deleted
// announcement disappears from the ongoing ประกาศ/อัปเดต list going
// forward, but each user's already-received in-app/email/LINE
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

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('announcements')
    .select('id, title, company_ids')
    .eq('id', params.id)
    .contains('company_ids', [session.company_id])
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) return notFound('Announcement')

  const { error } = await supabase
    .from('announcements')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'announcement.deleted', entity_type: 'announcement',
    entity_id: params.id, old_data: { title: existing.title }, req,
  })

  return ok({ id: params.id, deleted: true })
}
