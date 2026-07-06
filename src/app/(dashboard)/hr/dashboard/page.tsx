'use client'
// src/app/(dashboard)/hr/dashboard/page.tsx
import { useQuery }     from '@tanstack/react-query'
import { formatDays, LEAVE_TYPE_LABEL, cn } from '@/utils'
import { Users, CalendarDays, Clock, TrendingUp, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { LeaveType } from '@/types/database'

async function fetchHRStats() {
  const year  = new Date().getFullYear()
  const month = new Date().getMonth() + 1

  const [usersRes, leavesRes, tsRes] = await Promise.all([
    fetch('/api/admin/users?status=active&limit=1'),
    fetch(`/api/hr/leave?year=${year}&limit=1`),
    fetch(`/api/hr/timesheet?year=${year}&month=${month}&limit=1`),
  ])

  const [usersJson, leavesJson, tsJson] = await Promise.all([
    usersRes.json(), leavesRes.json(), tsRes.json(),
  ])

  // Pending leave
  const pendingRes  = await fetch('/api/hr/leave?status=pending&limit=50')
  const pendingJson = await pendingRes.json()

  // Pending timesheet
  const pendingTsRes  = await fetch(`/api/hr/timesheet?status=submitted&year=${year}&month=${month}&limit=50`)
  const pendingTsJson = await pendingTsRes.json()

  return {
    totalUsers:      usersJson.data?.total   ?? 0,
    totalLeaves:     leavesJson.data?.total  ?? 0,
    pendingLeaves:   pendingJson.data?.requests ?? [],
    pendingTs:       pendingTsJson.data?.timesheets ?? [],
    year, month,
  }
}

async function fetchLeaveTypeSummary(year: number) {
  const types: LeaveType[] = ['annual', 'sick', 'personal', 'maternity']
  const results = await Promise.all(
    types.map(async t => {
      const res  = await fetch(`/api/hr/leave?leave_type=${t}&year=${year}&status=approved&limit=1`)
      const json = await res.json()
      return { type: t, count: json.data?.total ?? 0 }
    })
  )
  return results
}

const TYPE_COLOR: Record<string, string> = {
  annual:    'bg-blue-100 text-blue-700',
  sick:      'bg-red-100 text-red-700',
  personal:  'bg-amber-100 text-amber-700',
  maternity: 'bg-pink-100 text-pink-700',
}

export default function HRDashboardPage() {
  const year = new Date().getFullYear()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['hr-stats'],
    queryFn: fetchHRStats,
    refetchInterval: 60_000,
  })
  const { data: typeSummary } = useQuery({
    queryKey: ['leave-type-summary', year],
    queryFn: () => fetchLeaveTypeSummary(year),
  })

  if (statsLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const pendingLeaves = stats?.pendingLeaves ?? []
  const pendingTs     = stats?.pendingTs     ?? []

  return (
    <div className="page-container space-y-6">

      <div className="flex items-center justify-between">
        <h1>ภาพรวม HR</h1>
        <span className="text-sm text-gray-400">ปี {year}</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'พนักงานทั้งหมด', value: stats?.totalUsers ?? 0, icon: Users,         color: 'text-blue-600',   bg: 'bg-blue-50',   href: '/admin/users'    },
          { label: 'ใบลาทั้งหมดปีนี้', value: stats?.totalLeaves ?? 0, icon: CalendarDays, color: 'text-green-600',  bg: 'bg-green-50',  href: '/hr/leave'       },
          { label: 'รออนุมัติใบลา',    value: pendingLeaves.length, icon: AlertCircle,   color: 'text-amber-600', bg: 'bg-amber-50',  href: '/approvals/leave'},
          { label: 'Timesheet รออนุมัติ', value: pendingTs.length, icon: Clock,          color: 'text-purple-600', bg: 'bg-purple-50', href: '/approvals/timesheet'},
        ].map(card => (
          <Link key={card.label} href={card.href} className="card p-4 hover:shadow-md transition-shadow">
            <div className={cn('inline-flex p-2 rounded-lg mb-2', card.bg)}>
              <card.icon className={cn('w-4 h-4', card.color)} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Leave type summary */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">ใบลาอนุมัติแล้วปีนี้ แยกตามประเภท</h3>
            <Link href="/hr/leave" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด</Link>
          </div>
          <div className="card-body space-y-3">
            {(typeSummary ?? []).map(item => (
              <div key={item.type} className="flex items-center justify-between">
                <span className={cn('badge', TYPE_COLOR[item.type])}>
                  {LEAVE_TYPE_LABEL[item.type as LeaveType]}
                </span>
                <div className="flex items-center gap-3 flex-1 mx-4">
                  <div className="h-1.5 bg-gray-100 rounded-full flex-1">
                    <div
                      className="h-full rounded-full bg-blue-400"
                      style={{ width: `${Math.min((item.count / Math.max(stats?.totalUsers ?? 1, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8 text-right">{item.count}</span>
              </div>
            ))}
            {!typeSummary?.length && (
              <p className="text-sm text-gray-400 text-center py-2">ไม่มีข้อมูล</p>
            )}
          </div>
        </div>

        {/* Pending leaves list */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              รออนุมัติใบลา ({pendingLeaves.length})
            </h3>
            <Link href="/hr/leave?status=pending" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด</Link>
          </div>
          {!pendingLeaves.length ? (
            <div className="card-body text-center text-sm text-gray-400 py-6">ไม่มีรายการรออนุมัติ ✓</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {pendingLeaves.slice(0, 8).map((lv: any) => (
                <Link key={lv.id} href={`/leave/${lv.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium shrink-0">
                    {lv.user?.first_name_th?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {lv.user?.first_name_th} {lv.user?.last_name_th}
                    </p>
                    <p className="text-xs text-gray-400">
                      {LEAVE_TYPE_LABEL[lv.leave_type as LeaveType]} · {formatDays(lv.total_days)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pending timesheets */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-500" />
              Timesheet รออนุมัติ ({pendingTs.length})
            </h3>
            <Link href="/hr/timesheet?status=submitted" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด</Link>
          </div>
          {!pendingTs.length ? (
            <div className="card-body text-center text-sm text-gray-400 py-6">ไม่มีรายการรออนุมัติ ✓</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {pendingTs.slice(0, 8).map((ts: any) => (
                <Link key={ts.id} href={`/timesheet/${ts.year}/${ts.month}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-medium shrink-0">
                    {ts.user?.first_name_th?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {ts.user?.first_name_th} {ts.user?.last_name_th}
                    </p>
                    <p className="text-xs text-gray-400">
                      เดือน {ts.month}/{ts.year} · {ts.total_hours} ชม.
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="card card-body">
          <h3 className="text-sm font-medium text-gray-700 mb-3">เมนูด่วน</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Export ใบลา',    href: '/hr/leave',          icon: CalendarDays },
              { label: 'Export Timesheet', href: '/hr/timesheet',     icon: Clock       },
              { label: 'จัดการวันหยุด',  href: '/hr/holidays',       icon: CalendarDays },
              { label: 'นโยบายการลา',    href: '/hr/leave-policies', icon: TrendingUp   },
              { label: 'Audit Log',       href: '/hr/audit-logs',     icon: AlertCircle  },
              { label: 'Import พนักงาน', href: '/admin/users/import', icon: Users        },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <item.icon className="w-4 h-4 text-gray-400 shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
