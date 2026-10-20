// src/app/api/admin/users/[id]/route.ts
// GET    — user detail + org node + balances
// PATCH  — update profile / role / status
// DELETE — real delete, but ONLY when the user has zero work history
// anywhere (2026-10-20, "จัดการผู้ใช้ก็เช่นเดียวกัน" — same "no delete
// button" complaint as Job Codes). This is strictly for undoing a mistaken
// account creation (wrong employee_code/email typed in, caught right away)
// — once a real employee has logged any leave, timesheet, OT, salary, a
// contract, an org-tree position, etc., Postgres's own FK constraints will
// refuse the delete (most of those are RESTRICT/NO ACTION against
// users.id), and the right move is "ระงับ" (status=inactive) or "ลาออก"
// (status=resigned) instead, to keep that history intact. See the FK audit
// done live via Supabase MCP on 2026-10-20 for the exact table list.

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

  // NOTE: org_node / line_account used to be embedded directly in this
  // select via PostgREST's nested-resource syntax. organization_nodes has
  // TWO foreign keys pointing at users (user_id, and acting_approver_id for
  // delegated approval), and a 3-level-deep self-referencing embed
  // (org_node -> parent -> parent's user) reusing the same FK hint at two
  // nesting depths kept returning a PostgREST 400 even with explicit FK
  // hints — confirmed via Supabase API logs, not just a guess. Rather than
  // keep fighting PostgREST's embed resolver, this fetches the user row on
  // its own (so a hiccup on the org-chart lookups can never make an
  // existing user "not found"), then fetches org_node / its parent's name /
  // line_account as separate, best-effort queries below.
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !user) {
    if (error) console.error('[admin/users/:id GET] user fetch failed', error)
    return notFound('User')
  }

  const { data: orgNode } = await supabase
    .from('organization_nodes')
    .select('id, parent_id, depth, acting_approver_id')
    .eq('user_id', params.id)
    .maybeSingle()

  let orgNodeParent: { user: { id: string; first_name_th: string; last_name_th: string } | null } | null = null
  if (orgNode?.parent_id) {
    const { data: parentNode } = await supabase
      .from('organization_nodes')
      .select('user:users!organization_nodes_user_id_fkey(id, first_name_th, last_name_th)')
      .eq('id', orgNode.parent_id)
      .maybeSingle()
    if (parentNode) orgNodeParent = { user: (parentNode.user as any) ?? null }
  }

  const { data: lineAccount } = await supabase
    .from('user_line_accounts')
    .select('line_user_id, display_name, linked_at')
    .eq('user_id', params.id)
    .maybeSingle()

  ;(user as any).org_node = orgNode ? { ...orgNode, parent: orgNodeParent } : null
  ;(user as any).line_account = lineAccount ?? null

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

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()
  if (session.id === params.id) return badRequest('ไม่สามารถลบบัญชีของตัวเองได้')

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('users').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).maybeSingle()
  if (!existing) return notFound('User')

  const { error } = await supabase
    .from('users').delete()
    .eq('id', params.id).eq('company_id', session.company_id)

  if (error) {
    // 23503 = foreign_key_violation — this user has real history somewhere
    // (leave/timesheet/OT/salary/contract/org position/etc.). That's the
    // expected, safe outcome for any real employee: tell the admin to
    // suspend/resign the account instead of trying to force a delete.
    if (error.code === '23503') {
      return badRequest('ไม่สามารถลบได้ ผู้ใช้นี้มีประวัติการทำงานอยู่แล้ว (ลงเวลา/ลา/เงินเดือน/สัญญา ฯลฯ) กรุณาใช้ "ระงับการใช้งาน" หรือ "ลาออก" แทน เพื่อรักษาประวัติไว้')
    }
    return serverError(error)
  }

  // Best-effort: also remove the linked Supabase Auth account so the email
  // can be reused immediately for a corrected re-entry. The public.users
  // row is already gone at this point regardless of whether this succeeds.
  if (existing.auth_user_id) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(existing.auth_user_id)
    if (authErr) console.error('[admin/users/:id DELETE] auth cleanup failed', { id: params.id, authErr })
  }

  await writeAuditLog({
    session, action: 'user.deleted', entity_type: 'user',
    entity_id: params.id, old_data: existing, req,
  })

  return ok({ id: params.id, deleted: true })
}
