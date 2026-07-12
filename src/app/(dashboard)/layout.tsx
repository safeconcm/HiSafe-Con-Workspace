// src/app/(dashboard)/layout.tsx
import { DashboardShell } from '@/components/layout/DashboardShell'
import { MustReadPopup } from '@/components/layout/MustReadPopup'
import { NewAnnouncementPopup } from '@/components/layout/NewAnnouncementPopup'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'
import type { SessionUser } from '@/types/database'

export default async function DashboardLayout({
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

  // An admin may be linked to more than one company (see company-context.ts)
  const { data: userRows, error: userRowError } = await admin
    .from('users')
    .select('id, company_id, employee_code, email, first_name_th, last_name_th, role, avatar_url, must_change_password, is_executive')
    .eq('auth_user_id', authUser.id)
    .eq('status', 'active')

  const userRow = pickActiveRow(userRows, activeCompanyId)

  if (!userRow) {
    console.error('[dashboard layout] no_profile lookup failed', {
      authUserId: authUser.id,
      error: userRowError,
    })
    redirect('/login?error=no_profile')
  }

  // Force a password change before letting a first-login (admin-created or
  // bulk-imported) account see any dashboard page. /change-password sits
  // outside this route group, so this redirect can't loop.
  if (userRow.must_change_password) redirect('/change-password')

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
      <MustReadPopup />
      <NewAnnouncementPopup />
      <DashboardShell session={sessionUser} company={companyRow}>
        {children}
      </DashboardShell>
    </div>
  )
}
