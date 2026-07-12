// src/app/api/announcements/unseen/route.ts
// GET /api/announcements/unseen — regular (require_ack = false) announcements
// targeting the current user's company that this user hasn't seen yet.
// Powers the lightweight, self-clearing announcement toast (see
// src/components/layout/NewAnnouncementPopup.tsx) — separate from
// /api/announcements/unread, which is only for require_ack = true
// announcements shown in the blocking MustReadPopup. Marking one "seen" here
// reuses the same /api/announcements/[id]/ack endpoint and the same
// announcement_reads table as the require_ack flow, since both are really
// the same underlying concept ("this user has seen this announcement") —
// they just surface through two different UI treatments.

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
    .eq('require_ack', false)
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
  const unseen = candidates.filter(a => !readIds.has(a.id))

  return ok({ announcements: unseen })
}
