// src/app/api/companies/route.ts
// GET /api/companies — list all companies (id, code, name). Used by the
// HR announcement composer to pick which company/companies to target.
// HR/Admin only — not sensitive data, but no reason to expose it wider.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('companies')
    .select('id, code, name_th')
    .order('code')
  if (error) return serverError(error)
  return ok({ companies: data })
}
