// src/app/api/hr/job-applications/route.ts
// GET /api/hr/job-applications — list submitted online job applications
// for the caller's active company. Visible to hr + admin roles only.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const q      = searchParams.get('q')
  const page   = parseInt(searchParams.get('page')  ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '20')
  const from   = (page - 1) * limit

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('job_applications')
    .select(
      'id, position_applied_1, full_name_th, email, mobile, status, photo_url, created_at',
      { count: 'exact' }
    )
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (status) query = query.eq('status', status)
  if (q)      query = query.or(`full_name_th.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`)

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ applications: data ?? [], total: count ?? 0, page })
}
