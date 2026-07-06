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
