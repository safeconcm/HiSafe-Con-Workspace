// src/app/api/hr/leave-policies/route.ts + [id]/route.ts combined concept
// GET  /api/hr/leave-policies?year=2026
// PATCH /api/hr/leave-policies/:id

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const year = parseInt(new URL(req.url).searchParams.get('year') ?? String(new Date().getFullYear()))
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('leave_policies')
    .select('*')
    .eq('company_id', session.company_id)
    .eq('year', year)
    .order('leave_type')

  if (error) return serverError(error)
  return ok({ policies: data ?? [], year })
}
