// src/app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar }  from '@/components/layout/Topbar'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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
  const { data: userRow, error: userRowError } = await admin
    .from('users')
    .select('id, company_id, employee_code, email, first_name_th, last_name_th, role, avatar_url')
    .eq('auth_user_id', authUser.id)
    .eq('status', 'active')
    .single()

  if (!userRow) {
    console.error('[dashboard layout] no_profile lookup failed', {
      authUserId: authUser.id,
      error: userRowError,
    })
    redirect('/login?error=no_profile')
  }

  const { data: companyRow } = await admin
    .from('companies')
    .select('code, name_th, logo_url')
    .eq('id', userRow.company_id)
    .single()

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
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar session={sessionUser} company={companyRow} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar session={sessionUser} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
