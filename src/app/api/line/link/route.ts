// src/app/api/line/link/route.ts
// GET  — check whether the current user has linked their LINE account
// POST — generate a fresh 6-digit linking code (valid 10 minutes) for the
//        user to send to the company LINE OA to complete linking

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
    .from('users')
    .select('line_user_id')
    .eq('id', session.id)
    .single()
  if (error) return serverError(error)

  return ok({ linked: !!data?.line_user_id })
}

function genCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  // Clear any earlier unused codes for this user so only the latest is valid.
  await supabase.from('line_link_codes').delete().eq('user_id', session.id).is('used_at', null)

  const code = genCode()
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error } = await supabase.from('line_link_codes').insert({ user_id: session.id, code, expires_at })
  if (error) return serverError(error)

  return ok({ code, expires_at })
}
