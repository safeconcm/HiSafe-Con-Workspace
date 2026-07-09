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
    .select('id, category, title, body, image_url, created_at')
    .contains('company_ids', [session.company_id])
    .order('created_at', { ascending: false })
  if (error) return serverError(error)
  return ok({ announcements: data })
}
