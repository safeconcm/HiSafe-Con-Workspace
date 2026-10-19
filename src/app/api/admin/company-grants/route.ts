// src/app/api/admin/company-grants/route.ts
// GET  /api/admin/company-grants?user_id=  — list a user's cross-company
//      read grants (admin only)
// POST /api/admin/company-grants            — grant a user read access to
//      another company (admin only) — see company_access_grants' migration
//      comment and getAccessibleCompanyIds in src/lib/api-helpers.ts for
//      the full design (item 5).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden, serverError,
  writeAuditLog,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                 return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const userId = new URL(req.url).searchParams.get('user_id')
  if (!userId) return badRequest('user_id required')

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('company_access_grants')
    .select('id, company_id, effective_from, effective_to, company:companies(id, code, name_th)')
    .eq('user_id', userId)
    .order('effective_from', { ascending: false })
  if (error) return serverError(error)
  return ok({ grants: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                 return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')
  const { user_id, company_id } = body
  if (!user_id || !company_id) return badRequest('user_id, company_id required')

  const supabase = createAdminSupabaseClient()

  // A user can't be granted read access into their own home company —
  // they already see it.
  const { data: targetUser } = await supabase
    .from('users').select('company_id').eq('id', user_id).maybeSingle()
  if (targetUser?.company_id === company_id) {
    return badRequest('ผู้ใช้นี้อยู่บริษัทนี้อยู่แล้ว ไม่ต้องให้สิทธิ์เพิ่ม')
  }

  const { data: grant, error } = await supabase
    .from('company_access_grants')
    .upsert(
      { user_id, company_id, granted_by: session.id, effective_from: new Date().toISOString().split('T')[0], effective_to: null },
      { onConflict: 'user_id,company_id' }
    )
    .select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'company_access_grant.created', entity_type: 'company_access_grant',
    entity_id: grant.id, new_data: grant, req,
  })
  return created(grant)
}
