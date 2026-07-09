// src/app/api/hr/work-schedule/overrides/[id]/route.ts
// DELETE — remove a specific-date work-schedule override (revert that date
// back to following the company's normal weekly pattern).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, notFound, serverError,
  writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('company_workday_overrides').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Override')

  const { error } = await supabase
    .from('company_workday_overrides').delete().eq('id', params.id)
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'work_schedule.override_removed', entity_type: 'company_workday_override',
    entity_id: params.id, old_data: existing, req,
  })
  return ok({ deleted: true })
}
