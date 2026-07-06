// src/app/api/notifications/read-all/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError,
} from '@/lib/api-helpers'

export async function PATCH(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('recipient_id', session.id)
    .eq('channel', 'in_app')
    .neq('status', 'read')

  if (error) return serverError(error)
  return ok({ message: 'All notifications marked as read' })
}
