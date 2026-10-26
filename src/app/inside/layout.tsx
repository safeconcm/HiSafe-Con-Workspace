// src/app/inside/layout.tsx
// CONNEX Inside — standalone internal-insights module (2026-10-26, "เปิด
// Module Connex Inside ที่ปิด ให้ admin เท่านั้นที่มองเห็น"), reached from
// the hub launcher (src/app/hub/page.tsx) same as /access and /ai. Starts
// with just the Job Codes revenue dashboard (มูลค่างาน รายปี/ลูกค้า — reuses
// the same /api/admin/jobs/revenue-summary data and chart components as
// src/app/access/jobs/revenue/page.tsx), with room to grow into more
// company-wide metrics later without needing a new module.
//
// No shared sidebar/shell here (like /ai) — this is a single-page dashboard
// for now, so a simple back-to-hub header in page.tsx is enough. Admin-only
// is enforced in two places on purpose: src/middleware.ts's ROLE_ROUTES
// (the real gate — blocks the request before it even reaches this layout)
// and the redirect below (a friendlier full-page bounce instead of a bare
// 403, same pattern as src/app/access/layout.tsx).
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'

export default async function InsideLayout({
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

  const { data: userRows } = await admin
    .from('users')
    .select('id, company_id, role, must_change_password')
    .eq('auth_user_id', authUser.id)
    .eq('status', 'active')

  const userRow = pickActiveRow(userRows, activeCompanyId)
  if (!userRow) redirect('/login?error=no_profile')
  if (userRow.must_change_password) redirect('/change-password')
  if (userRow.role !== 'admin') redirect('/hub')

  return <>{children}</>
}
