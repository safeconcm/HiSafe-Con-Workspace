// src/app/api/hr/audit-logs/route.ts
// GET /api/hr/audit-logs — paginated audit log for HR/Admin

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
  const page        = parseInt(searchParams.get('page')        ?? '1')
  const limit       = parseInt(searchParams.get('limit')       ?? '50')
  const entity_type = searchParams.get('entity_type')
  const action      = searchParams.get('action')
  const actor_id    = searchParams.get('actor_id')
  const date_from   = searchParams.get('date_from')
  const date_to     = searchParams.get('date_to')
  const from        = (page - 1) * limit

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (entity_type) query = query.eq('entity_type', entity_type)
  if (action)      query = query.ilike('action', `${action}%`)
  if (actor_id)    query = query.eq('actor_id', actor_id)
  if (date_from)   query = query.gte('created_at', date_from)
  if (date_to)     query = query.lte('created_at', `${date_to}T23:59:59Z`)

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ logs: data ?? [], total: count ?? 0, page, per_page: limit })
}
