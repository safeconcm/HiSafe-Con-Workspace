// src/app/api/notifications/[id]/read/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError
} from '@/lib/api-helpers'

export async function PATCH(
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
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('recipient_id', session.id)

    return ok({ id: params.id })
  } catch (err) {
    return serverError(err)
  }
}
