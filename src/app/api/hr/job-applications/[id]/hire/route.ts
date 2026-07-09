// src/app/api/hr/job-applications/[id]/hire/route.ts
// POST — convert an approved job application into a real employee account.
// Creates the Supabase Auth user + users profile row (reusing the same
// pattern as POST /api/admin/users and the CSV import route), copies the
// applicant's photo from the private "job-applications" bucket into the
// public "avatars" bucket, seeds leave balances, creates an initial
// contract from the hire_* fields already filled in on the application,
// and links job_applications.converted_user_id back to the new user.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound, serverError,
  writeAuditLog, findAuthUserByEmail, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  const employee_code = String(body.employee_code ?? '').trim().toUpperCase()
  const role = body.role ?? 'employee'
  if (!employee_code) return badRequest('กรุณาระบุรหัสพนักงาน')

  const supabase = createAdminSupabaseClient()

  const { data: app, error: appErr } = await supabase
    .from('job_applications').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (appErr || !app) return notFound('ใบสมัคร')
  if (app.converted_user_id) return badRequest('ใบสมัครนี้ถูกรับเข้าทำงานไปแล้ว')
  if (!app.email) return badRequest('ใบสมัครไม่มีอีเมล ไม่สามารถสร้างบัญชีได้')

  const hireDate     = body.hire_date ?? app.hire_start_date ?? new Date().toISOString().split('T')[0]
  const positionTh   = body.position_th ?? app.hire_position ?? app.position_applied_1 ?? null
  const department   = body.department ?? app.hire_department ?? null
  const baseSalary    = body.base_salary ?? app.hire_salary ?? 0
  const probationDays = Number(body.probation_days ?? 120)

  // Split "full_name_th" (single field on the application form) into
  // first/last name the way the rest of the system expects it — best
  // effort on the first space; HR can correct afterward if a name has no
  // space (rare for Thai names, but not impossible for foreign hires).
  const nameParts = String(app.full_name_th ?? '').trim().split(/\s+/)
  const first_name_th = nameParts[0] || app.full_name_th || 'พนักงานใหม่'
  const last_name_th  = nameParts.slice(1).join(' ') || '-'

  // 1. Auth user (reuse orphaned account if the email was already used to
  // sign in once before, same guard used by /api/admin/users).
  let authUserId: string
  let reusedExistingAuthUser = false
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: app.email.trim().toLowerCase(),
    password: `Hsc${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  })
  if (authErr) {
    if (/already.*(registered|exists)/i.test(authErr.message)) {
      const existing = await findAuthUserByEmail(supabase, app.email)
      if (!existing) return badRequest('อีเมลนี้มีในระบบแล้ว')
      authUserId = existing.id
      reusedExistingAuthUser = true
    } else {
      return serverError(authErr)
    }
  } else {
    authUserId = authData.user.id
  }

  // 2. Copy the applicant's photo from the private job-applications bucket
  // into the public avatars bucket, so it stays viewable long-term without
  // a signed-URL expiry (best-effort — a failed copy shouldn't block hiring).
  let avatar_url: string | null = null
  if (app.photo_url) {
    try {
      const { data: fileBlob } = await supabase.storage.from('job-applications').download(app.photo_url)
      if (fileBlob) {
        const ext = app.photo_url.split('.').pop() || 'jpg'
        const path = `${employee_code}/${Date.now()}.${ext}`
        const buf = await fileBlob.arrayBuffer()
        const { error: copyErr } = await supabase.storage.from('avatars').upload(path, buf, {
          contentType: fileBlob.type || 'image/jpeg', upsert: true,
        })
        if (!copyErr) {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
          avatar_url = pub.publicUrl
        }
      }
    } catch {
      // best-effort — HR can upload a photo manually afterward if this fails
    }
  }

  // 3. Insert user profile
  const { data: user, error: userErr } = await supabase
    .from('users')
    .insert({
      company_id:    session.company_id,
      employee_code,
      auth_user_id:  authUserId,
      email:         app.email.trim().toLowerCase(),
      first_name_th, last_name_th,
      position_th:   positionTh,
      department,
      role,
      hire_date:     hireDate,
      phone:         app.mobile ?? app.phone ?? null,
      avatar_url,
      status:        'active',
      must_change_password: true,
    })
    .select()
    .single()

  if (userErr) {
    if (!reusedExistingAuthUser) await supabase.auth.admin.deleteUser(authUserId)
    if (userErr.message.includes('unique')) return badRequest('รหัสพนักงานหรืออีเมลนี้มีในระบบแล้ว')
    return serverError(userErr)
  }

  // 4. Leave balances
  await supabase.rpc('init_leave_balances', {
    p_user_id: user.id, p_company_id: session.company_id,
    p_hire_date: hireDate, p_year: new Date().getFullYear(),
  }).then(() => {}, () => {})

  // 5. Initial contract (probation), mirroring the CSV-import contract logic
  {
    const contractYear = new Date().getFullYear()
    const { count } = await supabase.from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', session.company_id)
      .gte('created_at', `${contractYear}-01-01`)
    const compCode = session.company_id.slice(-4).toUpperCase()
    const contract_no = `CT-${compCode}-${contractYear}-${String((count ?? 0) + 1).padStart(4, '0')}`

    const probEnd = new Date(hireDate)
    probEnd.setDate(probEnd.getDate() + probationDays)

    await supabase.from('contracts').insert({
      company_id: session.company_id, user_id: user.id, contract_no,
      contract_type: 'permanent', status: 'active', start_date: hireDate,
      position_th: positionTh, department,
      probation_days: probationDays,
      probation_end: probEnd.toISOString().split('T')[0],
      probation_status: 'pending',
      base_salary: Number(baseSalary) || 0, salary_type: 'monthly',
      created_by: session.id,
    }).then(() => {}, () => {})
  }

  // 6. Link the application back to the new user
  await supabase.from('job_applications').update({
    status: 'hired', converted_user_id: user.id,
    reviewed_by: session.id, reviewed_at: new Date().toISOString(),
  }).eq('id', params.id)

  await writeAuditLog({
    session, action: 'job_application.hired', entity_type: 'job_application',
    entity_id: params.id, new_data: { converted_user_id: user.id, employee_code }, req,
  })

  return ok({ user_id: user.id })
}
