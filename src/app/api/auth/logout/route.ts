// src/app/api/auth/logout/route.ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()

  const response = NextResponse.redirect(new URL('/login', req.url), 303)
  response.cookies.delete('connex_session')
  return response
}
