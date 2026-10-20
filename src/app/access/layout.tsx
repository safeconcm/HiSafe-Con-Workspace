// src/app/access/layout.tsx
// CONNEX Access — standalone role/user-management module (2026-10-16),
// split out of CONNEX EM per request: "การกำหนดสิทธิ์ Role แอดคนเข้าระบบ...
// จำเป็นต้องแยกออกมาไหม จัดการเฉพาะเรื่องนี้". Previously these pages lived
// at /admin/* inside the (dashboard) route group (EM's sidebar/shell); they
// now live at /access/* with their own shell (AccessShell/AccessSidebar) so
// this reads as its own app reached from the hub launcher, same as how /ai
// was split out earlier. Session-loading logic here is a near-duplicate of
// src/app/(dashboard)/layout.tsx on purpose — this is a sibling top-level
// route, not nested under it, so it needs its own auth guard.
import { AccessShell } from '@/components/access/AccessShell'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'
import type { SessionUser } from '@/types/database'

export default async function AccessLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value

  const { data: userRows, error: userRowError } = await admin
    .from('users')
    .select('id, company_id, employee_code, email, first_name_th, last_name_th, role, avatar_url, must_change_password, is_executive')
    .eq('auth_user_id', authUser.id)
    .eq('status', 'active')

  const userRow = pickActiveRow(userRows, activeCompanyId)

  if (!userRow) {
    console.error('[access layout] no_profile lookup failed', {
      authUserId: authUser.id,
      error: userRowError,
    })
    redirect('/login?error=no_profile')
  }

  if (userRow.must_change_password) redirect('/change-password')

  // Admin-only (2026-10-16, follow-up: "ต้องจำกัดให้ Admin เข้าใช้" — HR used
  // to be let in here too since this doubled as HR's employee directory;
  // that's now its own page at /hr/employees instead, so this module no
  // longer needs to admit HR at all) — EXCEPT 2026-10-20's one addition,
  // Cost Centers (per request: "ใครควรเห็น Tab นี้ได้บ้าง — Admin + HR/
  // บัญชี"), so this top-level guard now admits 'hr' too. Every other page
  // under /access still blocks HR — that's enforced by middleware's
  // per-route ROLE_ROUTES (see src/middleware.ts), which is more granular
  // than this layout-level check and is what actually keeps HR out of
  // /access/users, /access/jobs, etc. This check is the friendlier
  // full-page bounce for someone who isn't admin OR hr at all.
  if (!['admin', 'hr'].includes(userRow.role)) redirect('/hub')

  const companyIds = Array.from(new Set((userRows ?? []).map(r => r.company_id)))
  const { data: companyRows } = await admin
    .from('companies')
    .select('id, code, name_th, logo_url')
    .in('id', companyIds)

  const companyRow = companyRows?.find(c => c.id === userRow.company_id) ?? null

  const sessionUser: SessionUser = {
    id:            userRow.id,
    auth_user_id:  authUser.id,
    company_id:    userRow.company_id,
    company_code:  companyRow?.code ?? '',
    employee_code: userRow.employee_code,
    email:         userRow.email,
    first_name_th: userRow.first_name_th,
    last_name_th:  userRow.last_name_th,
    role:          userRow.role,
    avatar_url:    userRow.avatar_url,
    is_executive:  userRow.is_executive ?? false,
    available_companies: companyRows ?? [],
  }

  return (
    <div data-company={sessionUser.company_code} className="flex h-screen overflow-hidden bg-gray-50">
      <AccessShell session={sessionUser} company={companyRow}>
        {children}
      </AccessShell>
    </div>
  )
}
