// src/app/api/auth/switch-company/route.ts
// POST { company_id } — switches the active company for admins who are
// linked to more than one company (see src/lib/company-context.ts).
// Verifies the requesting auth user actually has an active profile in the
// target company before switching, then sets the active-company cookie and
// invalidates the cached session cookie so it's re-resolved on next request.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server'
import { ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const companyId = body?.company_id
  if (!companyId) {
    return NextResponse.json({ data: null, error: 'company_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('users')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .single()

  if (!row) {
    return NextResponse.json({ data: null, error: 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้' }, { status: 403 })
  }

  const response = NextResponse.json({ data: { ok: true }, error: null })
  response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  // Force middleware/layout to re-resolve the session against the new company
  response.cookies.delete('connex_session')
  return response
}
