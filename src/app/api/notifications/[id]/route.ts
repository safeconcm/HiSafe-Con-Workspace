// src/app/api/notifications/[id]/route.ts
// DELETE /api/notifications/:id — remove one of the current user's own
// in-app notifications (2026-07-13, per user request for delete parity
// with the "อัปเดต" page). Hard-delete, not soft: unlike announcements
// (a shared company-wide row), each notification row already belongs to
// exactly one recipient, so deleting it only ever affects that person —
// no other user's data is touched. Scoped with .eq('recipient_id', ...)
// so a user can never delete anyone else's notification even if they
// guessed another id.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError
} from '@/lib/api-helpers'

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  try {
    await supabase
      .from('notifications')
      .delete()
      .eq('id', params.id)
      .eq('recipient_id', session.id)

    return ok({ id: params.id, deleted: true })
  } catch (err) {
    return serverError(err)
  }
}
