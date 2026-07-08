'use client'
// src/components/layout/Sidebar.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarDays, Clock, Briefcase,
  Bell, Users, Building2, Settings, ChevronDown,
  ClipboardList, BarChart3, ShieldCheck, LogOut, Wallet
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

function CompanySwitcher({
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
      window.location.href = '/dashboard'
    }
  }

  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0', companyBadgeClass(current?.code))}>
          {companyInitials(current?.code)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {current?.name_th ?? 'HiSafe-CON'}
          </p>
          <p className="text-xs text-gray-400">WorkSpace</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative px-4 py-4 border-b border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        className="flex items-center gap-3 w-full text-left disabled:opacity-60"
      >
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0', companyBadgeClass(current?.code))}>
          {companyInitials(current?.code)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {switching ? 'กำลังสลับ...' : (current?.name_th ?? 'HiSafe-CON')}
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

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles?: string[]
  children?: { label: string; href: string }[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'หน้าหลัก',
    href:  '/dashboard',
    icon:  LayoutDashboard,
  },
  {
    label: 'การลา',
    href:  '/leave/my',
    icon:  CalendarDays,
    children: [
      { label: 'ใบลาของฉัน',    href: '/leave/my'  },
      { label: 'ยื่นใบลาใหม่',  href: '/leave/new' },
      { label: 'ปฏิทินทีม',     href: '/leave/team' },
    ],
  },
  {
    label: 'Timesheet',
    href:  '/timesheet',
    icon:  Clock,
  },
  {
    label: 'OT (ล่วงเวลา)',
    href:  '/approvals/ot',
    icon:  Clock,
  },
  {
    label: 'รออนุมัติ',
    href:  '/approvals/leave',
    icon:  ClipboardList,
    roles: ['supervisor', 'hr', 'admin'],
    children: [
      { label: 'อนุมัติใบลา',       href: '/approvals/leave'      },
      { label: 'อนุมัติ Timesheet', href: '/approvals/timesheet'  },
      { label: 'อนุมัติ OT',        href: '/approvals/ot'         },
    ],
  },
  {
    label: 'การแจ้งเตือน',
    href:  '/notifications',
    icon:  Bell,
  },
  // HR section
  {
    label: 'HR',
    href:  '/hr/dashboard',
    icon:  BarChart3,
    roles: ['hr', 'admin'],
    children: [
      { label: 'ภาพรวม HR',      href: '/hr/dashboard'       },
      { label: 'จัดการใบลา',     href: '/hr/leave'           },
      { label: 'นโยบายการลา',    href: '/hr/leave-policies'  },
      { label: 'Timesheet ทั้งหมด', href: '/hr/timesheet'   },
      { label: 'วันหยุด',         href: '/hr/holidays'        },
      { label: 'รายงาน',          href: '/hr/reports'         },
      { label: 'Audit Log',       href: '/hr/audit-logs'      },
      { label: 'สัญญาจ้าง',      href: '/hr/contracts'       },
      { label: 'ทดลองงาน',       href: '/hr/probation'       },
      { label: 'ใบรับรองงาน',    href: '/hr/certificates'    },
      { label: 'การลาออก',       href: '/hr/resignation'     },
      { label: 'สมัครงาน',       href: '/hr/recruitment'     },
      { label: 'ใบสมัครออนไลน์', href: '/hr/job-applications' },
      { label: 'เงินเดือน',       href: '/hr/salary'          },
    ],
  },
  {
    label: 'ค่าแรง/Payroll',
    href:  '/payroll',
    icon:  Wallet,
    roles: ['hr', 'admin'],
  },
  // Admin section
  {
    label: 'ผู้ดูแลระบบ',
    href:  '/admin/users',
    icon:  ShieldCheck,
    roles: ['admin'],
    children: [
      { label: 'จัดการผู้ใช้',   href: '/admin/users'        },
      { label: 'โครงสร้างองค์กร', href: '/admin/organization' },
      { label: 'Job Codes',       href: '/admin/jobs'         },
      { label: 'ตั้งค่า',         href: '/admin/settings'     },
    ],
  },
]

interface SidebarProps {
  session: SessionUser
  company: { code: string; name_th: string; logo_url: string | null } | null
}

export function Sidebar({ session, company }: SidebarProps) {
  const pathname = usePathname()
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const visibleItems = NAV_ITEMS.filter(
    item => !item.roles || item.roles.includes(session.role)
  )

  return (
    <aside className="no-print hidden lg:flex flex-col w-64 border-r border-gray-200 bg-white h-screen overflow-y-auto shrink-0">

      {/* Company logo / switcher */}
      <CompanySwitcher current={company} companies={session.available_companies ?? []} />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(item => {
          const Icon = item.icon
          const hasChildren = !!item.children?.length
          const isOpen = openMenus[item.label] ?? isActive(item.href)
          const active = isActive(item.href)

          if (hasChildren) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  className={cn('nav-item w-full justify-between', active && 'active')}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown
                    className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')}
                  />
                </button>
                {isOpen && (
                  <div className="ml-7 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
                    {item.children!.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block py-1.5 px-2 text-sm rounded-md transition-colors',
                          pathname === child.href
                            ? 'text-blue-700 font-medium bg-blue-50'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link key={item.href} href={item.href}>
              <div className={cn('nav-item', active && 'active')}>
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* User profile at bottom */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
            {session.first_name_th.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {fullNameTH(session)}
            </p>
            <p className="text-xs text-gray-400 truncate">{session.email}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST" className="mt-1">
          <button
            type="submit"
            className="nav-item w-full text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            <span>ออกจากระบบ</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
