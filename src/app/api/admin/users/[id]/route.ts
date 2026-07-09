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

  // NOTE: organization_nodes has TWO foreign keys pointing at users
  // (user_id, and acting_approver_id for delegated approval). The top-level
  // "org_node" embed below must pin the FK explicitly with
  // "!organization_nodes_user_id_fkey" — without it, PostgREST can't tell
  // which relationship to embed and errors out, which this route was
  // silently mapping to a generic "not found" for every single user.
  const { data: user, error } = await supabase
    .from('users')
    .select(`
      *,
      org_node:organization_nodes!organization_nodes_user_id_fkey(
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

  // Aggregate the "employee 360" data that used to require visiting several
  // separate pages: contracts, certificates, salary history, and recent
  // timesheets. All scoped to this one user, newest first.
  const [
    { data: contracts },
    { data: certificates },
    { data: salaryRecords },
    { data: timesheets },
    { data: jobApplication },
  ] = await Promise.all([
    supabase.from('contracts').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('employment_certificates').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('salary_records').select('*').eq('user_id', params.id).order('effective_date', { ascending: false }),
    supabase.from('timesheets').select('*').eq('user_id', params.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(6),
    supabase.from('job_applications').select('id, position_applied_1, hire_position, hire_department, hire_salary, hire_start_date, status, created_at')
      .eq('converted_user_id', params.id).maybeSingle(),
  ])

  return ok({
    user, balances: balances ?? [],
    contracts: contracts ?? [], certificates: certificates ?? [],
    salary_records: salaryRecords ?? [], timesheets: timesheets ?? [],
    job_application: jobApplication ?? null,
  })
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

  // Email is handled separately: it's globally unique and also lives on the
  // linked Supabase Auth account, so changing it needs a format check, a
  // uniqueness check, and — if the user has ever logged in (auth_user_id set)
  // — an update to auth.users too, otherwise login would break silently.
  if ('email' in body) {
    const newEmail = String(body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return badRequest('รูปแบบอีเมลไม่ถูกต้อง')
    }
    if (newEmail !== existing.email) {
      const { data: dupe } = await supabase
        .from('users').select('id').eq('email', newEmail).neq('id', params.id).maybeSingle()
      if (dupe) return badRequest('มีผู้ใช้อื่นใช้อีเมลนี้อยู่แล้ว')

      if (existing.auth_user_id) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(
          existing.auth_user_id, { email: newEmail, email_confirm: true }
        )
        if (authErr) return serverError(new Error(`เปลี่ยนอีเมลไม่สำเร็จ (ระบบล็อกอิน): ${authErr.message}`))
      }
      updates.email = newEmail
    }
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
