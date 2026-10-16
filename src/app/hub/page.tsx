// src/app/hub/page.tsx
// App launcher shown right after login — lets the person pick which CONNEX
// module to open instead of dropping them straight into CONNEX EM (the old
// behavior). Added 2026-10-15 per request to split the single HR/Time/Leave
// system into 4 separate "apps": EM (live), Biz / Project / Insights (not
// built yet — rendered as disabled "coming soon" cards for now, no routes
// exist for them). See src/app/page.tsx and the login/callback `next`
// fallback, which now point here instead of straight to /dashboard.
//
// Visual refresh (2026-10-15, follow-up feedback: "ดูจืดไปหน่อย ... สไตล์
// บริษัทระดับโลก"): reused the dark "blueprint-grid" hero scene + brand-color
// blob glows + white Card primitive from the login page (src/app/(auth)/
// login/page.tsx) so the launcher and the login screen read as one
// consistent visual identity, instead of a plain light-gray page. This stays
// a server component — no cursor-follow JS, the glow/grid CSS already has
// static fallback positions (--mx/--my default to 50%/30% in globals.css).
// Also: swapped the "SC"/"HC" text initials badge for the real company
// logo image, added a 5th "CONNEX AI" card, and replaced the tagline with
// the new copy.
//
// CONNEX AI placement (2026-10-16, follow-up feedback): AI shouldn't live
// inside CONNEX EM's dashboard shell, and there should be a chat box right
// here on the hub, not just an icon leading elsewhere. So: the full-page
// chat moved from src/app/(dashboard)/ai to a standalone src/app/ai (no EM
// sidebar — see that file's own header note), and a floating chat widget
// (src/components/ai/FloatingAIChat.tsx) was added directly to this page.
//
// CONNEX AI card removed (2026-10-16, same-day follow-up): once the
// floating widget existed, a 5th icon pointing to the same feature was
// redundant — back to the original 4 apps. The widget itself got a
// pulsing ring + a "ถาม CONNEX AI ได้เลย" greeting bubble so it's not
// missed (see FloatingAIChat.tsx) instead of relying on a grid icon.
//
// CONNEX SAFETY placeholder + multi-company switcher (2026-10-16, follow-up
// request): added a "CONNEX SAFETY" coming-soon card (same treatment as
// CONNEX Biz) ahead of actually scoping/building it. Also: an admin who
// manages both SAFECON and HIGHCON had no way to pick a company from this
// page — it just showed whichever company the cookie happened to point at.
// Added HubCompanySwitcher (src/components/hub/HubCompanySwitcher.tsx),
// fetching available_companies the same way src/app/(dashboard)/layout.tsx
// does for the EM sidebar's switcher.
import type { Metadata } from 'next'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'
import { fullNameTH } from '@/utils'
import { Users, ShoppingCart, HardHat, BarChart3, ShieldAlert, LogOut, Lock } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { FloatingAIChat } from '@/components/ai/FloatingAIChat'
import { HubCompanySwitcher } from '@/components/hub/HubCompanySwitcher'

export const metadata: Metadata = { title: 'เลือกระบบ' }

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
  {
    key: 'safety',
    name: 'CONNEX SAFETY',
    description: 'ความปลอดภัยหน้างาน',
    icon: ShieldAlert,
    href: null,
    color: 'bg-red-600',
    available: true, // everyone can access once built — just not built yet
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

  // Fetch every company this person belongs to (not just the active one) so
  // HubCompanySwitcher can offer a dropdown for admins linked to more than
  // one — same pattern as src/app/(dashboard)/layout.tsx.
  const companyIds = Array.from(new Set((meRows ?? []).map((r) => r.company_id)))
  const { data: companyRows } = await admin
    .from('companies')
    .select('id, code, name_th')
    .in('id', companyIds)

  const company = companyRows?.find((c) => c.id === me.company_id) ?? null

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0f1a] blueprint-grid">
      {/* Shared hero scene with the login page — static (no JS cursor
          tracking) since this is a server component; the CSS falls back to
          a fixed --mx/--my position, which still reads as an ambient glow. */}
      <div className="cursor-spotlight absolute inset-0 pointer-events-none" />
      <div className="hero-horizon-glow absolute inset-0 pointer-events-none" />
      <div className="absolute -top-32 -left-24 w-[34rem] h-[34rem] rounded-full bg-[#0C447C]/25 blur-3xl animate-blob pointer-events-none" />
      <div
        className="absolute -bottom-24 -right-16 w-[34rem] h-[34rem] rounded-full bg-[#3B6D11]/20 blur-3xl animate-blob pointer-events-none"
        style={{ animationDelay: '-7s' }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="border-b border-white/10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <HubCompanySwitcher
              current={company}
              companies={companyRows ?? []}
              userName={fullNameTH(me)}
            />
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-red-400 transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>ออกจากระบบ</span>
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-14">
          <div className="w-full max-w-3xl animate-fade-in-up">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center bg-white rounded-2xl p-4 shadow-lg shadow-black/30 mb-6">
                <Image src="/logos/connex-logo.png" alt="CONNEX" width={292} height={306} className="object-contain h-14 sm:h-16 w-auto" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">เลือกระบบที่ต้องการใช้งาน</h1>
              <p className="text-slate-200 text-base sm:text-lg font-semibold mt-4 tracking-wide">
                Connect Everything. Move Forward.
              </p>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto leading-relaxed">
                แพลตฟอร์มที่เชื่อมโยงคน กระบวนการ และข้อมูลขององค์กรไว้ในระบบเดียว
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-5">
              {APPS.map((app) => {
                const Icon = app.icon
                const content = (
                  <Card
                    accent={!!app.href}
                    className={`h-full p-6 flex flex-col items-center text-center gap-3 transition-all duration-200 ${
                      app.href
                        ? 'hover:-translate-y-1 hover:shadow-black/60 cursor-pointer'
                        : 'opacity-75'
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
                  </Card>
                )

                return (
                  <div key={app.key} className="w-full sm:w-56">
                    {app.href ? (
                      <Link href={app.href} className="block h-full">{content}</Link>
                    ) : (
                      <div aria-disabled="true" className="h-full">{content}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </main>

        <footer className="text-center text-[11px] text-slate-500 py-6 font-mono tracking-widest uppercase">
          &copy; 2026 CONNEX
        </footer>
      </div>

      {/* Floating chat bubble (2026-10-16) — lets people ask CONNEX AI right
          from the launcher instead of only through the full /ai page. */}
      <FloatingAIChat />
    </div>
  )
}
