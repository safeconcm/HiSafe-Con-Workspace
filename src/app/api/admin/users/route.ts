// src/app/api/admin/users/route.ts
// GET  /api/admin/users  — list all users in company
// POST /api/admin/users  — create single user + init leave balances

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog,
} from '@/lib/api-helpers'

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'admin' && session.role !== 'hr') return forbidden()

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q')
  const role   = searchParams.get('role')
  const status = searchParams.get('status') ?? 'active'
  const page   = parseInt(searchParams.get('page')  ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '50')
  const from   = (page - 1) * limit

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('users')
    .select(`
      id, company_id, employee_code, email,
      first_name_th, last_name_th, first_name_en, last_name_en,
      position_th, department, role, status, hire_date, phone,
      avatar_url, created_at
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('employee_code')
    .range(from, from + limit - 1)

  if (status) query = query.eq('status', status)
  if (role)   query = query.eq('role', role)
  if (search) {
    query = query.or(
      `first_name_th.ilike.%${search}%,last_name_th.ilike.%${search}%,` +
      `employee_code.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ users: data ?? [], total: count ?? 0, page, per_page: limit })
}

// ── POST — create single user ─────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const {
    employee_code, email, first_name_th, last_name_th,
    first_name_en, last_name_en, position_th, position_en,
    department, role, hire_date, phone,
    // Optional initial balances for import
    annual_leave_balance, sick_leave_balance, personal_leave_balance,
    password,
  } = body

  if (!employee_code || !email || !first_name_th || !last_name_th || !hire_date) {
    return badRequest('employee_code, email, first_name_th, last_name_th, hire_date required')
  }

  const supabase   = createAdminSupabaseClient()
  const currentYear = new Date().getFullYear()

  // 1. Create Supabase Auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: password ?? `Hsc${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  })
  if (authErr) {
    if (authErr.message.includes('already')) return badRequest('อีเมลนี้มีในระบบแล้ว')
    return serverError(authErr)
  }

  // 2. Insert user profile
  const { data: user, error: userErr } = await supabase
    .from('users')
    .insert({
      company_id:    session.company_id,
      employee_code: employee_code.trim().toUpperCase(),
      auth_user_id:  authData.user.id,
      email:         email.trim().toLowerCase(),
      first_name_th, last_name_th,
      first_name_en: first_name_en ?? null,
      last_name_en:  last_name_en  ?? null,
      position_th:   position_th   ?? null,
      position_en:   position_en   ?? null,
      department:    department     ?? null,
      role:          role           ?? 'employee',
      hire_date,
      phone:         phone          ?? null,
      status:        'active',
    })
    .select()
    .single()

  if (userErr) {
    // Rollback auth user
    await supabase.auth.admin.deleteUser(authData.user.id)
    if (userErr.message.includes('unique')) return badRequest('รหัสพนักงานนี้มีในระบบแล้ว')
    return serverError(userErr)
  }

  // 3. Initialize leave balances from policy
  await supabase.rpc('init_leave_balances', {
    p_user_id:    user.id,
    p_company_id: session.company_id,
    p_hire_date:  hire_date,
    p_year:       currentYear,
  }).then(() => {}, () => {})

  // 4. Override balances if provided (migration from old system)
  if (annual_leave_balance !== undefined || sick_leave_balance !== undefined || personal_leave_balance !== undefined) {
    const updates: { leave_type: string; quota_days: number }[] = []
    if (annual_leave_balance   !== undefined) updates.push({ leave_type: 'annual',   quota_days: Number(annual_leave_balance)   })
    if (sick_leave_balance     !== undefined) updates.push({ leave_type: 'sick',     quota_days: Number(sick_leave_balance)     })
    if (personal_leave_balance !== undefined) updates.push({ leave_type: 'personal', quota_days: Number(personal_leave_balance) })

    for (const u of updates) {
      await supabase.from('leave_balances').upsert({
        company_id:  session.company_id,
        user_id:     user.id,
        leave_type:  u.leave_type,
        year:        currentYear,
        quota_days:  u.quota_days,
      }, { onConflict: 'user_id,leave_type,year' })
    }
  }

  await writeAuditLog({
    session, action: 'user.created', entity_type: 'user',
    entity_id: user.id, new_data: { ...user, password: '[redacted]' }, req,
  })

  return created(user)
}
