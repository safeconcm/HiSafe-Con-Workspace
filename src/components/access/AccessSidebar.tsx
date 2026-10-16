'use client'
// src/components/access/AccessSidebar.tsx
// Dedicated sidebar for the standalone "CONNEX Access" module (2026-10-16),
// split out of CONNEX EM per user request: role/user management ("การกำหนด
// สิทธิ์ Role แอดคนเข้าระบบ") shouldn't live inside the EM dashboard shell —
// it's its own thing people reach from the hub, same pattern as how /ai was
// pulled out earlier. This mirrors src/components/layout/Sidebar.tsx's shape
// (back-to-hub link, company switcher, nav list, user chip + logout) but
// with a short nav scoped to just Users / Organization / Job Codes /
// Settings instead of EM's full HR/Time/Leave menu. Its own small
// CompanySwitcher variant redirects to /access (not /dashboard) after a
// company switch, so an admin switching companies here stays in this module.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users, Building2, Briefcase, Settings as SettingsIcon,
  ArrowLeft, LogOut, ChevronDown, ShieldCheck,
} from 'lucide-react'
import { cn, fullNameTH } from '@/utils'
import type { SessionUser } from '@/types/database'
import { useState } from 'react'

type CompanyInfo = { id?: string; code: string; name_th: string; logo_url: string | null }

function companyBadgeClass(code?: string) {
  return code === 'HIGHCON' ? 'bg-[#0C447C]' : 'bg-[#3B6D11]'
}
function companyInitials(code?: string) {
  return code === 'HIGHCON' ? 'HC' : 'SC'
}

function AccessCompanySwitcher({
  current,
  companies,
}: {
  current: CompanyInfo | null
  companies: { id: string; code: string; name_th: string; logo_url: string | null }[]
}) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const switchTo = async (companyId: string) => {
    if (switching) return
    setOpen(false)
    setSwitching(true)
    try {
      await fetch('/api/auth/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })
    } finally {
      window.location.href = '/access'
    }
  }

  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0', companyBadgeClass(current?.code))}>
          {companyInitials(current?.code)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{current?.name_th ?? 'CONNEX'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative px-4 py-4 border-b border-gray-100">
      <button onClick={() => setOpen(o => !o)} disabled={switching} className="flex items-center gap-3 w-full text-left disabled:opacity-60">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0', companyBadgeClass(current?.code))}>
          {companyInitials(current?.code)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {switching ? 'กำลังสลับ...' : (current?.name_th ?? 'CONNEX')}
          </p>
          <p className="text-xs text-gray-400">แตะเพื่อสลับบริษัท</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
          {companies.map(c => (
            <button
              key={c.id}
              onClick={() => switchTo(c.id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left hover:bg-gray-50',
                c.code === current?.code && 'bg-blue-50 text-blue-700 font-medium'
              )}
            >
              <div className={cn('w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0', companyBadgeClass(c.code))}>
                {companyInitials(c.code)}
              </div>
              {c.name_th}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const NAV_ITEMS = [
  { label: 'จัดการผู้ใช้',    href: '/access/users',        icon: Users,       roles: ['hr', 'admin'] },
  { label: 'โครงสร้างองค์กร', href: '/access/organization', icon: Building2,   roles: ['admin'] },
  { label: 'Job Codes',        href: '/access/jobs',         icon: Briefcase,   roles: ['admin'] },
  { label: 'ตั้งค่า',          href: '/access/settings',     icon: SettingsIcon, roles: ['admin'] },
]

interface AccessSidebarProps {
  session: SessionUser
  company: { code: string; name_th: string; logo_url: string | null } | null
  mobileOpen?: boolean
  onClose?: () => void
}

export function AccessSidebar({ session, company, mobileOpen = false, onClose }: AccessSidebarProps) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(session.role))

  return (
    <aside
      className={cn(
        'no-print flex-col w-64 border-r border-gray-200 bg-white h-screen overflow-y-auto shrink-0',
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out',
        'lg:static lg:z-auto lg:flex lg:translate-x-0',
        mobileOpen ? 'flex translate-x-0' : 'hidden -translate-x-full'
      )}
    >
      <Link
        href="/hub"
        onClick={() => onClose?.()}
        className="flex items-center gap-2 px-4 py-2.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-b border-gray-100 transition-colors shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>กลับไปหน้าเลือกระบบ</span>
      </Link>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-red-50/40">
        <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <p className="text-sm font-semibold text-gray-900">CONNEX Access</p>
      </div>

      <AccessCompanySwitcher current={company} companies={session.available_companies ?? []} />

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(item => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link key={item.href} href={item.href} onClick={() => onClose?.()}>
              <div className={cn('nav-item', active && 'active')}>
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
            {session.first_name_th.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{fullNameTH(session)}</p>
            <p className="text-xs text-gray-400 truncate">{session.email}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST" className="mt-1">
          <button type="submit" className="nav-item w-full text-red-600 hover:text-red-700 hover:bg-red-50">
            <LogOut className="w-4 h-4" />
            <span>ออกจากระบบ</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
