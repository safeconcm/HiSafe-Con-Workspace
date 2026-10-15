// src/app/hub/page.tsx
// App launcher shown right after login — lets the person pick which CONNEX
// module to open instead of dropping them straight into CONNEX EM (the old
// behavior). Added 2026-10-15 per request to split the single HR/Time/Leave
// system into 4 separate "apps": EM (live), Biz / Project / Insights (not
// built yet — rendered as disabled "coming soon" cards for now, no routes
// exist for them). See src/app/page.tsx and the login/callback `next`
// fallback, which now point here instead of straight to /dashboard.
import type { Metadata } from 'next'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'
import { fullNameTH } from '@/utils'
import { Users, ShoppingCart, HardHat, BarChart3, LogOut, Lock } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = { title: 'เลือกระบบ' }

function companyBadgeClass(code?: string) {
  return code === 'HIGHCON' ? 'bg-[#0C447C]' : 'bg-[#3B6D11]'
}

function companyInitials(code?: string) {
  return code === 'HIGHCON' ? 'HC' : 'SC'
}

const APPS = [
  {
    key: 'em',
    name: 'CONNEX EM',
    description: 'HR / Time / Leave',
    icon: Users,
    href: '/dashboard',
    color: 'bg-blue-600',
    available: true,
  },
  {
    key: 'biz',
    name: 'CONNEX Biz',
    description: 'Procurement / Expenses',
    icon: ShoppingCart,
    href: null,
    color: 'bg-emerald-600',
    available: true, // everyone can access once built — just not built yet
  },
  {
    key: 'project',
    name: 'CONNEX Project',
    description: 'Construction Management',
    icon: HardHat,
    href: null,
    color: 'bg-amber-600',
    available: false, // restricted — only specific people, once built
  },
  {
    key: 'insights',
    name: 'CONNEX Insights',
    description: 'Reports / Analytics',
    icon: BarChart3,
    href: null,
    color: 'bg-violet-600',
    available: false, // restricted — only specific people, once built
  },
] as const

export default async function HubPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value

  const { data: meRows } = await admin
    .from('users')
    .select('id, company_id, email, first_name_th, last_name_th, role, must_change_password')
    .eq('auth_user_id', authUser.id)
    .eq('status', 'active')

  const me = pickActiveRow(meRows, activeCompanyId)
  if (!me) redirect('/login?error=no_profile')
  if (me.must_change_password) redirect('/change-password')

  const { data: company } = await admin
    .from('companies')
    .select('code, name_th, logo_url')
    .eq('id', me.company_id)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${companyBadgeClass(company?.code)}`}>
              {companyInitials(company?.code)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {company?.name_th ?? 'CONNEX'}
              </p>
              <p className="text-xs text-gray-400">{fullNameTH(me)}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>ออกจากระบบ</span>
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold text-gray-900">เลือกระบบที่ต้องการใช้งาน</h1>
            <p className="text-sm text-gray-500 mt-1">Smart Platform เชื่อมต่อทุกการทำงานในระบบเดียว</p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {APPS.map((app) => {
              const Icon = app.icon
              const content = (
                <div
                  className={`relative h-full rounded-2xl border p-6 flex flex-col items-center text-center gap-3 transition-all ${
                    app.href
                      ? 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md cursor-pointer'
                      : 'border-gray-100 bg-gray-50 opacity-70'
                  }`}
                >
                  {!app.available && (
                    <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">
                      <Lock className="w-3 h-3" />
                      จำกัดสิทธิ์
                    </span>
                  )}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white ${app.color} ${app.href ? '' : 'grayscale opacity-60'}`}>
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{app.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{app.description}</p>
                  </div>
                  {!app.href && (
                    <span className="text-[11px] font-medium text-gray-400 bg-gray-200 rounded-full px-2.5 py-0.5">
                      Coming Soon
                    </span>
                  )}
                </div>
              )

              return app.href ? (
                <Link key={app.key} href={app.href}>{content}</Link>
              ) : (
                <div key={app.key} aria-disabled="true">{content}</div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
