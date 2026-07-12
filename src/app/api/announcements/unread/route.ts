// src/app/api/announcements/unread/route.ts
// GET /api/announcements/unread — announcements targeting the current user's
// company that are marked require_ack = true and this user hasn't
// acknowledged yet. Used by the dashboard-wide must-read popup (does not
// affect the regular announcements list/page, which shows everything).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  const { data: candidates, error } = await supabase
    .from('announcements')
    .select('id, category, title, body, attachment_url, attachment_type, attachment_name, created_at')
    .contains('company_ids', [session.company_id])
    .eq('require_ack', true)
    .order('created_at', { ascending: true })
  if (error) return serverError(error)
  if (!candidates || candidates.length === 0) return ok({ announcements: [] })

  const { data: reads, error: readsErr } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', session.id)
    .in('announcement_id', candidates.map(a => a.id))
  if (readsErr) return serverError(readsErr)

  const readIds = new Set((reads ?? []).map(r => r.announcement_id))
  const unread = candidates.filter(a => !readIds.has(a.id))

  return ok({ announcements: unread })
}
