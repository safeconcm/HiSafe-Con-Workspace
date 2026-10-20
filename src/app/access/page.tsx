// src/app/access/page.tsx
// Landing route for CONNEX Access (/access) — redirects straight to the
// user list, same entry point the old EM sidebar's "ผู้ดูแลระบบ" nav item
// used (href: '/admin/users'). No index UI of its own needed yet; revisit
// if this module grows enough to want its own overview/dashboard.
//
// 2026-10-20: role-aware now that HR can reach one page in this module
// (Cost Centers — see src/app/access/layout.tsx's guard and
// src/middleware.ts's ROLE_ROUTES). /access/users is still admin-only, so
// redirecting HR there unconditionally would just bounce them straight back
// out via middleware — send HR to the one page they can actually open
// instead. Does its own tiny session lookup (same pattern layout.tsx
// already uses, and the same "near-duplicate on purpose" reasoning that
// file's own comment gives) rather than threading the role through some
// shared context, since this is the only other place in the module that
// needs it.
import { redirect } from 'next/navigation'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'

export default async function AccessIndexPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value

  const { data: userRows } = await admin
    .from('users')
    .select('id, company_id, role')
    .eq('auth_user_id', authUser.id)
    .eq('status', 'active')

  const userRow = pickActiveRow(userRows, activeCompanyId)

  redirect(userRow?.role === 'hr' ? '/access/cost-centers' : '/access/users')
}
