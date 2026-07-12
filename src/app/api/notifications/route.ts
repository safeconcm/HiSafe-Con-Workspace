// src/app/api/notifications/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError
} from '@/lib/api-helpers'

// GET /api/notifications
// Returns current user's notifications + unread count
export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unread') === 'true'
  const page       = parseInt(searchParams.get('page') ?? '1')
  const limit      = parseInt(searchParams.get('limit') ?? '20')
  const from       = (page - 1) * limit
  const to         = from + limit - 1

  const supabase = createAdminSupabaseClient()

  try {
    // Unread count (in-app only)
    const { count: unread_count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', session.id)
      .eq('channel', 'in_app')
      .neq('status', 'read')

    if (unreadOnly) {
      return ok({ unread_count: unread_count ?? 0 })
    }

    // Full list
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('recipient_id', session.id)
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count, error } = await query

    if (error) throw error

    return ok({
      notifications: data,
      total: count ?? 0,
      unread_count: unread_count ?? 0,
      page,
      per_page: limit,
    })
  } catch (err) {
    return serverError(err)
  }
}

// DELETE /api/notifications — bulk-delete the current user's own
// notifications (2026-07-13, powers the checkbox multi-select on the
// notifications page). Body: { ids: string[] }. Same safety scoping as
// the single-item route: always filtered to .eq('recipient_id', session.id),
// so this can only ever delete the caller's own notifications.
export async function DELETE(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const payload = await req.json().catch(() => null)
  const ids = Array.isArray(payload?.ids) ? payload.ids.filter((x: unknown) => typeof x === 'string') : []
  if (!ids.length) return ok({ deleted: 0 })

  const supabase = createAdminSupabaseClient()
  try {
    await supabase
      .from('notifications')
      .delete()
      .eq('recipient_id', session.id)
      .in('id', ids)

    return ok({ deleted: ids.length })
  } catch (err) {
    return serverError(err)
  }
}
