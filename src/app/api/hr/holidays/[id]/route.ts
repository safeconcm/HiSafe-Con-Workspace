// src/app/api/hr/holidays/[id]/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, notFound, serverError,
  writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('holidays').select('id').eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Holiday')

  await supabase.from('holidays').update({ is_active: false }).eq('id', params.id)
  await writeAuditLog({ session, action: 'holiday.deleted', entity_type: 'holiday', entity_id: params.id, req })
  return ok({ id: params.id, deleted: true })
}
