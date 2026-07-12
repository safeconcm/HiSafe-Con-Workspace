// src/app/api/announcements/route.ts
// GET /api/announcements — announcements targeting the current user's
// company, for any authenticated user (employee-facing list/view).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('id, category, title, body, attachment_url, attachment_type, attachment_name, require_ack, created_at')
    .contains('company_ids', [session.company_id])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return serverError(error)

  // Attach this user's own read/ack status per announcement — powers the
  // "ยังไม่อ่าน" / "ต้องรับทราบ" tabs on the announcements page. Same
  // announcement_reads table used by both the must-read ack flow and the
  // lightweight unseen-toast flow (see /api/announcements/unseen).
  const ids = (data ?? []).map(a => a.id)
  let readIds = new Set<string>()
  if (ids.length) {
    const { data: reads, error: readsErr } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', session.id)
      .in('announcement_id', ids)
    if (readsErr) return serverError(readsErr)
    readIds = new Set((reads ?? []).map(r => r.announcement_id))
  }

  const announcements = (data ?? []).map(a => ({ ...a, is_read: readIds.has(a.id) }))
  return ok({ announcements })
}
