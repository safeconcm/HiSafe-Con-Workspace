'use client'
// src/components/layout/Sidebar.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarDays, Clock, Briefcase,
  Bell, Users, Building2, Settings, ChevronDown,
  ClipboardList, BarChart3, LogOut, MessageCircle, Megaphone, User,
  MessageCircleQuestion, ArrowLeft, Gauge, Scale, BookOpen,
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
            {current?.name_th ?? 'CONNEX'}
          </p>
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

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles?: string[]
  // Hide for executive users (session.is_executive) even if their role
  // would otherwise show this item — e.g. an MD holding role='supervisor'
  // for approval/permission purposes, but who doesn't submit personal
  // leave/timesheet like a regular department-manager supervisor would.
  hideForExecutive?: boolean
  // Shown ONLY for whoever sits at the root of the org tree (2026-10-20,
  // "ข้อ 1": MD dashboard) — independent of `roles` above (a root user can
  // hold any role; see session.is_org_root / isOrgRoot() in api-helpers.ts).
  onlyForOrgRoot?: boolean
  children?: { label: string; href: string }[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'หน้าหลัก',
    href:  '/dashboard',
    icon:  LayoutDashboard,
  },
  {
    label: 'โปรไฟล์ของฉัน',
    href:  '/profile',
    icon:  User,
  },
  // MD dashboard (2026-10-20, "ข้อ 1") — only whoever is literally at the
  // top of the org tree sees this link at all; the page itself re-checks
  // the same condition server-side (via the API's isOrgRoot gate) so
  // nothing leaks even if someone guesses the URL.
  {
    label: 'ภาพรวมผู้บริหาร',
    href:  '/dashboard/executive',
    icon:  Gauge,
    onlyForOrgRoot: true,
  },
  {
    // 2026-10-25, "admin แอด User ให้ A เป็น HR แต่ A ก็เป็นพนักงานปกติที่
    // รับบทบาท HR ... เวลาที่ A จะลายื่นใบของตัวเองไม่ได้" — this used to be
    // hidden for role 'hr'/'admin' on the assumption that HR/Admin never
    // submit their own leave (true for a dedicated full-time HR person, but
    // breaks the moment one person wears both the employee and HR hat, which
    // is the common case in a small company). `role` now has nothing to do
    // with whether someone sees this — the only gate is `hideForExecutive`,
    // which only applies to someone an Admin has explicitly marked as
    // `is_executive` (genuine top-management who really has no one to
    // approve their own leave — see find_approver()'s NULL-parent
    // auto-approve case, and the is_executive toggle on the user edit page).
    // Defaults to false for everyone, including every HR/Admin, so this menu
    // stays visible unless an Admin deliberately opts someone out.
    label: 'การลา',
    href:  '/leave/my',
    icon:  CalendarDays,
    hideForExecutive: true,
    children: [
      { label: 'ใบลาของฉัน',    href: '/leave/my'  },
      { label: 'ยื่นใบลาใหม่',  href: '/leave/new' },
      { label: 'ปฏิทินทีม',     href: '/leave/team' },
    ],
  },
  {
    // Same reasoning as 'การลา' above (2026-10-25) — role no longer hides
    // this; only an explicit is_executive flag does.
    label: 'Timesheet',
    href:  '/timesheet',
    icon:  Clock,
    hideForExecutive: true,
  },
  {
    label: 'OT (ล่วงเวลา)',
    href:  '/approvals/ot',
    icon:  Clock,
  },
  {
    label: 'ทำงานชดเชยวันหยุด',
    href:  '/approvals/comp-work',
    icon:  CalendarDays,
  },
  {
    label: 'รออนุมัติ',
    href:  '/approvals/leave',
    icon:  ClipboardList,
    roles: ['supervisor', 'hr', 'admin'],
    children: [
      { label: 'อนุมัติใบลา',           href: '/approvals/leave'      },
      { label: 'อนุมัติ Timesheet',     href: '/approvals/timesheet'  },
      { label: 'อนุมัติ OT',            href: '/approvals/ot'         },
      { label: 'อนุมัติงานชดเชย',       href: '/approvals/comp-work'  },
    ],
  },
  {
    label: 'การแจ้งเตือน',
    href:  '/notifications',
    icon:  Bell,
  },
  {
    label: 'ติดต่อ HR',
    href:  '/inquiries',
    icon:  MessageCircleQuestion,
  },
  {
    label: 'อัปเดต',
    href:  '/announcements',
    icon:  Megaphone,
  },
  {
    label: 'เชื่อมต่อ LINE',
    href:  '/line/link',
    icon:  MessageCircle,
  },
  // ข้อ 3 — separate tab from the user guide below, per request. Content is
  // a placeholder until HR sends the real policy document to upload.
  {
    label: 'กฎระเบียบบริษัท',
    href:  '/company-policy',
    icon:  Scale,
  },
  // ข้อ 4 — separate tab, built out now with its own illustrated content.
  {
    label: 'คู่มือการใช้งาน',
    href:  '/user-guide',
    icon:  BookOpen,
  },
  // HR section
  {
    label: 'HR',
    href:  '/hr/dashboard',
    icon:  BarChart3,
    roles: ['hr', 'admin'],
    children: [
      { label: 'ภาพรวม HR',      href: '/hr/dashboard'       },
      { label: 'คำถามจากพนักงาน', href: '/inquiries'         },
      { label: 'จัดการใบลา',     href: '/hr/leave'           },
      { label: 'นโยบายการลา',    href: '/hr/leave-policies'  },
      { label: 'Timesheet ทั้งหมด', href: '/hr/timesheet'   },
      { label: 'วันหยุด',         href: '/hr/holidays'        },
      { label: 'ตารางวันทำงาน',  href: '/hr/work-schedule'   },
      { label: 'รายงาน',          href: '/hr/reports'         },
      { label: 'Audit Log',       href: '/hr/audit-logs'      },
      { label: 'สัญญาจ้าง',      href: '/hr/contracts'       },
      { label: 'ทดลองงาน',       href: '/hr/probation'       },
      { label: 'เช็คลิสต์ onboard', href: '/hr/onboarding'   },
      { label: 'ใบรับรองงาน',    href: '/hr/certificates'    },
      { label: 'การลาออก',       href: '/hr/resignation'     },
      { label: 'สมัครงาน',       href: '/hr/recruitment'     },
      { label: 'ใบสมัครออนไลน์', href: '/hr/job-applications' },
      { label: 'เงินเดือน',       href: '/hr/salary'          },
      { label: 'Payroll พนักงานประจำ (Staff)', href: '/hr/payroll-salary' },
      // Moved in here from a flat top-level nav item (2026-10-16, follow-up:
      // "ค่าแรง/payroll ... ควรอยู่ใน Tab HR") — this is a labor-cost report
      // for HR/management, not a page most people need one click from the
      // main nav. Note: a supervisor could previously see this item in their
      // sidebar too (the API at /api/payroll still supports a scoped
      // "my team" view for supervisor — see that route's own comment) —
      // moving it inside the HR dropdown (roles: ['hr','admin'] above) means
      // a supervisor no longer sees a sidebar link to it. Revisit if
      // supervisors are still expected to use this directly.
      { label: 'ต้นทุนแรงงานตาม Job (Job Cost)', href: '/payroll' },
      // 2026-10-20, per request: "Time sheet ช่องให้เลือก Activity code ...
      // ดึงข้อมูลไปสร้าง Tab ... Cost Centers" — originally its own tab
      // under CONNEX Access, moved here the same day (follow-up: "ย้าย Cost
      // Centers ให้ HR ดู Tab HR ... เพราะ Payroll job cost จะอยู่ด้วยกัน")
      // to sit right next to its closest relative, Job Direct Cost above —
      // same report shape, grouped by Activity Code instead of Job Code.
      // See src/app/(dashboard)/payroll/cost-centers/page.tsx.
      { label: 'Cost Centers (ตาม Activity Code)', href: '/payroll/cost-centers' },
      { label: 'จัดการอัปเดต',   href: '/hr/announcements'   },
      { label: 'ข้อมูลพนักงานทั้งหมด', href: '/hr/employees'  },
    ],
  },
  // Admin/role-management moved out to its own module (2026-10-16) — see
  // src/app/access/layout.tsx. What used to be the "ผู้ดูแลระบบ" section
  // here is now reached via the "CONNEX Access" card on /hub, same as how
  // CONNEX AI isn't in this sidebar either. Kept out of this nav entirely
  // rather than linking out to /access from inside EM, so it's clear this
  // is a separate app, not an EM sub-page.
]

interface SidebarProps {
  session: SessionUser
  company: { code: string; name_th: string; logo_url: string | null } | null
  // Mobile/tablet drawer state (2026-07-13) — desktop (lg:) rendering is
  // completely unaffected by these; see DashboardShell for the state owner.
  mobileOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ session, company, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const isActive = (href: string) => {
    if (pathname === href) return true
    // /timesheet/detail/[id] is a generic read-only viewer opened from
    // Approvals/HR (see timesheet/detail/[id]/page.tsx) — it isn't part of
    // the personal "Timesheet" section this nav item points to
    // (/timesheet/[year]/[month]), so it must NOT match this prefix.
    // Otherwise a supervisor reviewing an employee's approved timesheet saw
    // "Timesheet" highlighted as if they'd navigated into their own monthly
    // editor, which read as "the system took me back to my own timesheet"
    // even though the content shown was correct — reported 2026-07-11.
    if (href === '/timesheet' && pathname.startsWith('/timesheet/detail')) return false
    return pathname.startsWith(href + '/')
  }

  const visibleItems = NAV_ITEMS.filter(
    item =>
      (!item.roles || item.roles.includes(session.role)) &&
      !(item.hideForExecutive && session.is_executive) &&
      !(item.onlyForOrgRoot && !session.is_org_root)
  )

  return (
    <aside
      className={cn(
        'no-print flex-col w-64 border-r border-gray-200 bg-white h-screen overflow-y-auto shrink-0',
        // Fixed slide-in drawer below lg; static in-flow column at lg+.
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out',
        'lg:static lg:z-auto lg:flex lg:translate-x-0',
        mobileOpen ? 'flex translate-x-0' : 'hidden -translate-x-full'
      )}
    >

      {/* Back to the app launcher (2026-10-16, follow-up: "ควรจะมีปุ่มย้อนกลับ
          ด้วย ไม่ใช่แค่กด back จาก Webbrowser") — the only way out of here
          before this was the logout button at the very bottom. */}
      <Link
        href="/hub"
        onClick={() => onClose?.()}
        className="flex items-center gap-2 px-4 py-2.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-b border-gray-100 transition-colors shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>กลับไปหน้าเลือกระบบ</span>
      </Link>

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
                        onClick={() => onClose?.()}
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
            <Link key={item.href} href={item.href} onClick={() => onClose?.()}>
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
