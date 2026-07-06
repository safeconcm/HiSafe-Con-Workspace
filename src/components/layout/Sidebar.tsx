'use client'
// src/components/layout/Sidebar.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarDays, Clock, Briefcase,
  Bell, Users, Building2, Settings, ChevronDown,
  ClipboardList, BarChart3, ShieldCheck, LogOut
} from 'lucide-react'
import { cn, fullNameTH } from '@/utils'
import type { SessionUser } from '@/types/database'
import { useState } from 'react'

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
      { label: 'ใบรับรองงาน',    href: '/hr/certificates'    },
      { label: 'การลาออก',       href: '/hr/resignation'     },
      { label: 'สมัครงาน',       href: '/hr/recruitment'     },
      { label: 'เงินเดือน',       href: '/hr/salary'          },
    ],
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
    <aside className="hidden lg:flex flex-col w-64 border-r border-gray-200 bg-white h-screen overflow-y-auto shrink-0">

      {/* Company logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0',
            company?.code === 'HIGHCON' ? 'bg-[#0C447C]' : 'bg-[#3B6D11]'
          )}
        >
          {company?.code === 'HIGHCON' ? 'HC' : 'SC'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {company?.name_th ?? 'HiSafe-CON'}
          </p>
          <p className="text-xs text-gray-400">WorkSpace</p>
        </div>
      </div>

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
