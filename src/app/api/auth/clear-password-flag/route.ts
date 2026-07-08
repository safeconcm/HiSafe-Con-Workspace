// src/app/api/auth/clear-password-flag/route.ts
// POST — called right after a user successfully sets a new password on the
// forced first-login change-password page. Always clears the flag on the
// CALLER's own row only (session.id) — never accepts a target user id, so
// there's no way to clear someone else's flag via this endpoint.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, serverError,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('users')
    .update({ must_change_password: false })
    .eq('id', session.id)

  if (error) return serverError(error)
  return ok({ cleared: true })
}
