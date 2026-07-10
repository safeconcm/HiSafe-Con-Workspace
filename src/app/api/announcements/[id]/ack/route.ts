// src/app/api/announcements/[id]/ack/route.ts
// POST /api/announcements/:id/ack — record that the current user has read
// and acknowledged a require_ack announcement (dismisses the must-read
// popup for this user going forward). Idempotent: re-acking is a no-op.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, badRequest, serverError,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { id } = await params
  if (!id) return badRequest('ไม่พบประกาศ')

  const supabase = createAdminSupabaseClient()

  // Confirm the announcement actually targets this user's company before
  // recording an ack — avoids logging reads for announcements that were
  // never meant for this person.
  const { data: announcement } = await supabase
    .from('announcements')
    .select('id, company_ids')
    .eq('id', id)
    .maybeSingle()
  if (!announcement || !announcement.company_ids?.includes(session.company_id)) {
    return badRequest('ไม่พบประกาศนี้')
  }

  const { error } = await supabase
    .from('announcement_reads')
    .upsert({ announcement_id: id, user_id: session.id }, { onConflict: 'announcement_id,user_id' })
  if (error) return serverError(error)

  return ok({ acknowledged: true })
}
