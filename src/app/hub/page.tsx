// src/app/hub/page.tsx
// App launcher shown right after login — lets the person pick which CONNEX
// module to open instead of dropping them straight into CONNEX EM (the old
// behavior). Added 2026-10-15. See src/app/page.tsx and the login/callback
// `next` fallback, which now point here instead of straight to /dashboard.
//
// Visual refresh (2026-10-15): dark "blueprint-grid" hero scene + brand-color
// blob glows + white Card primitive, shared with the login page
// (src/app/(auth)/login/page.tsx) so the two screens read as one identity.
// Server component — no cursor-follow JS, the glow/grid CSS already has
// static fallback positions (--mx/--my default to 50%/30% in globals.css).
//
// CONNEX AI (2026-10-16): lives as a floating chat widget on this page
// (src/components/ai/FloatingAIChat.tsx), not as a grid card — AI shouldn't
// be "a module to pick", it should just be available everywhere on the hub.
// Full-page version at the standalone src/app/ai (no EM sidebar).
//
// Multi-company switcher (2026-10-16): an admin managing more than one
// company had no way to pick one from this page. Added
// HubCompanySwitcher (src/components/hub/HubCompanySwitcher.tsx), fetching
// available_companies the same way src/app/(dashboard)/layout.tsx does.
//
// Coming-soon cards removed (2026-10-16, follow-up feedback: pre-listing
// unbuilt modules "ดูเหมือนคาดหวังมากไป" — looked like promises the hub
// hadn't earned yet): CONNEX Biz / Project / Insights / Safety were all
// removed from APPS below. Only modules that actually exist show up here
// now — each comes back the day it's really built. CONNEX Access
// (src/app/access) was added the same day as the first genuinely new
// module since this cleanup, split out of CONNEX EM's old /admin pages.
import type { Metadata } from 'next'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'
import { fullNameTH } from '@/utils'
import { Users, ShieldCheck, LogOut } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { FloatingAIChat } from '@/components/ai/FloatingAIChat'
import { HubCompanySwitcher } from '@/components/hub/HubCompanySwitcher'

export const metadata: Metadata = { title: 'เลือกระบบ' }

// Only modules that are actually built and live go here (2026-10-16, per
// feedback: pre-listing unbuilt modules as "Coming Soon" cards reads like
// promises the hub hasn't earned yet — "เหมือนโดนด่าเลย ว่าคาดหวังมากไป").
// CONNEX Biz / Project / Insights / Safety were removed from this list for
// that reason, not abandoned — each comes back the day it's actually built,
// which also means it gets pulled straight into active work instead of
// sitting half-visible on the hub for months. `roles` is optional —
// omit it for anything everyone should see; EM and Access are the only two
// modules live right now.
const APPS = [
  {
    key: 'em',
    name: 'CONNEX EM',
    description: 'HR / Time / Leave',
    icon: Users,
    href: '/dashboard',
    color: 'bg-blue-600',
  },
  {
    key: 'access',
    name: 'CONNEX Access',
    description: 'สิทธิ์ผู้ใช้ / โครงสร้างองค์กร',
    icon: ShieldCheck,
    href: '/access',
    color: 'bg-red-600',
    // Admin-only (2026-10-16, follow-up: "ต้องจำกัดให้ Admin เข้าใช้") — HR
    // used to be able to open this too (it used to double as HR's employee
    // directory), but that's what caused the overlap with CONNEX HR's own
    // "ข้อมูลพนักงานทั้งหมด" tab. HR's directory is now its own read-only
    // page at /hr/employees instead — see Sidebar.tsx and that route.
    // A Cost Centers tab briefly let HR back in here too (2026-10-20) but
    // was moved out to src/app/(dashboard)/payroll/cost-centers the same
    // day (follow-up: "ย้าย Cost Centers ให้ HR ดู Tab HR ... เพราะ
    // Payroll job cost จะอยู่ด้วยกัน") — HR reaches it through CONNEX EM's
    // own sidebar now (see Sidebar.tsx's HR dropdown), not through this
    // card, so this is Admin-only again.
    roles: ['admin'] as const,
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
              {APPS
                .filter((app) => !('roles' in app) || (app.roles as readonly string[]).includes(me.role))
                .map((app) => {
                const Icon = app.icon
                const content = (
                  <Card
                    accent
                    className="h-full p-6 flex flex-col items-center text-center gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-black/60 cursor-pointer"
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white ${app.color}`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{app.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{app.description}</p>
                    </div>
                  </Card>
                )

                return (
                  <div key={app.key} className="w-full sm:w-56">
                    <Link href={app.href} className="block h-full">{content}</Link>
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
