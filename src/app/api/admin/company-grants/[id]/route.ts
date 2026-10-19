// src/app/api/admin/company-grants/[id]/route.ts
// DELETE /api/admin/company-grants/:id — revoke a cross-company read grant

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, notFound, serverError, writeAuditLog,
} from '@/lib/api-helpers'

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)                 return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: grant } = await supabase
    .from('company_access_grants').select('*').eq('id', params.id).maybeSingle()
  if (!grant) return notFound('Grant')

  const { error } = await supabase.from('company_access_grants').delete().eq('id', params.id)
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'company_access_grant.revoked', entity_type: 'company_access_grant',
    entity_id: params.id, old_data: grant, req,
  })
  return ok({ id: params.id })
}
