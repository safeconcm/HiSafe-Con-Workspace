// src/app/api/admin/users/[id]/route.ts
// GET   — user detail + org node + balances
// PATCH — update profile / role / status

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!['admin', 'hr'].includes(session.role)) return forbidden()

  const supabase = createAdminSupabaseClient()

  const { data: user, error } = await supabase
    .from('users')
    .select(`
      *,
      org_node:organization_nodes(
        id, parent_id, depth, acting_approver_id,
        parent:organization_nodes!organization_nodes_parent_id_fkey(
          user:users!organization_nodes_user_id_fkey(id, first_name_th, last_name_th)
        )
      ),
      line_account:user_line_accounts(line_user_id, display_name, linked_at)
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !user) return notFound('User')

  // Fetch leave balances
  const { data: balances } = await supabase
    .from('leave_balance_summary')
    .select('*')
    .eq('user_id', params.id)
    .eq('year', new Date().getFullYear())

  return ok({ user, balances: balances ?? [] })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('users').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('User')

  const body = await req.json().catch(() => ({}))
  const allowed = [
    'first_name_th','last_name_th','first_name_en','last_name_en',
    'position_th','position_en','department','role','status',
    'hire_date','phone','avatar_url','resign_date',
  ]

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (body.status === 'resigned' && !body.resign_date) {
    updates.resign_date = new Date().toISOString().split('T')[0]
  }

  const { data: updated, error } = await supabase
    .from('users').update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'user.updated', entity_type: 'user',
    entity_id: params.id, old_data: existing, new_data: updated, req,
  })

  return ok(updated)
}
