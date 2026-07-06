// src/app/(dashboard)/dashboard/page.tsx
import type { Metadata } from 'next'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDateTH, LEAVE_TYPE_LABEL, LEAVE_STATUS_COLOR, LEAVE_STATUS_LABEL } from '@/utils'
import { CalendarDays, Clock, ClipboardList, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = { title: 'หน้าหลัก' }

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const admin = createAdminClient()

  // Get user profile
  const { data: me } = await admin
    .from('users')
    .select('id, company_id, role, first_name_th')
    .eq('auth_user_id', authUser.id)
    .single()

  if (!me) redirect('/login?error=no_profile')

  const currentYear  = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  // Leave balances
  const { data: balances } = await admin
    .from('leave_balances')
    .select('*')
    .eq('user_id', me.id)
    .eq('year', currentYear)

  // Recent leave requests
  const { data: recentLeaves } = await admin
    .from('leave_requests')
    .select('id, leave_type, status, start_date, end_date, total_days')
    .eq('user_id', me.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Current month timesheet
  const { data: timesheet } = await admin
    .from('timesheets')
    .select('id, status, total_hours')
    .eq('user_id', me.id)
    .eq('year', currentYear)
    .eq('month', currentMonth)
    .single()

  // Pending approvals (for supervisor/hr/admin)
  let pendingLeaveCount  = 0
  let pendingTsCount     = 0
  if (['supervisor', 'hr', 'admin'].includes(me.role)) {
    const { count: lc } = await admin
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', me.company_id)
      .eq('current_approver_id', me.id)
      .eq('status', 'pending')
    pendingLeaveCount = lc ?? 0

    const { count: tc } = await admin
      .from('timesheets')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', me.company_id)
      .eq('current_approver_id', me.id)
      .eq('status', 'submitted')
    pendingTsCount = tc ?? 0
  }

  type BalanceRow = { leave_type: string; quota_days: number; carried_forward: number; adjusted_days: number; used_days: number; pending_days: number }
  const annualBalance   = balances?.find((b: BalanceRow) => b.leave_type === 'annual')
  const sickBalance     = balances?.find((b: BalanceRow) => b.leave_type === 'sick')
  const personalBalance = balances?.find((b: BalanceRow) => b.leave_type === 'personal')

  const available = (b: typeof annualBalance): number =>
    b ? Math.max(b.quota_days + b.carried_forward + b.adjusted_days - b.used_days - b.pending_days, 0) : 0

  return (
    <div className="page-container space-y-6">

      {/* Welcome */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          สวัสดี, คุณ{me.first_name_th} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatDateTH(new Date().toISOString())} · ปี {currentYear}
        </p>
      </div>

      {/* Pending approvals banner */}
      {(pendingLeaveCount > 0 || pendingTsCount > 0) && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-sm text-amber-800">
            มีรายการรออนุมัติ:
            {pendingLeaveCount > 0 && (
              <Link href="/approvals/leave" className="ml-1 font-medium underline">
                ใบลา {pendingLeaveCount} รายการ
              </Link>
            )}
            {pendingTsCount > 0 && (
              <Link href="/approvals/timesheet" className="ml-1 font-medium underline">
                Timesheet {pendingTsCount} รายการ
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Leave balance cards */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">วันลาคงเหลือ {currentYear}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'พักร้อน',  balance: annualBalance,   color: 'text-blue-600',  bg: 'bg-blue-50'  },
            { label: 'ลาป่วย',   balance: sickBalance,     color: 'text-red-600',   bg: 'bg-red-50'   },
            { label: 'ลากิจ',    balance: personalBalance, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(item => (
            <div key={item.label} className="card p-4">
              <div className={`inline-flex p-2 rounded-lg ${item.bg} mb-2`}>
                <CalendarDays className={`w-4 h-4 ${item.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {available(item.balance)}
                <span className="text-sm font-normal text-gray-400 ml-1">วัน</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
              {item.balance && (
                <p className="text-xs text-gray-400 mt-1">
                  ใช้ไปแล้ว {item.balance.used_days} / {item.balance.quota_days + item.balance.carried_forward} วัน
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* This month timesheet */}
      <div className="card p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-purple-50">
          <Clock className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Timesheet เดือนนี้</p>
          <p className="text-xs text-gray-500">
            {timesheet
              ? `${timesheet.total_hours} ชั่วโมง · ${
                  timesheet.status === 'draft' ? 'ยังไม่ส่ง' :
                  timesheet.status === 'submitted' ? 'รออนุมัติ' :
                  timesheet.status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'
                }`
              : 'ยังไม่ได้กรอก'}
          </p>
        </div>
        <Link
          href={`/timesheet/${currentYear}/${currentMonth}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ดู/แก้ไข →
        </Link>
      </div>

      {/* Recent leaves */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500">ใบลาล่าสุด</h2>
          <Link href="/leave/my" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด</Link>
        </div>
        {!recentLeaves?.length ? (
          <div className="card p-6 text-center text-sm text-gray-400">
            ยังไม่มีประวัติการลา
          </div>
        ) : (
          <div className="card divide-y divide-gray-100">
            {recentLeaves.map((leave: any) => (
              <Link
                key={leave.id}
                href={`/leave/${leave.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {LEAVE_TYPE_LABEL[leave.leave_type as keyof typeof LEAVE_TYPE_LABEL]}
                    <span className="ml-2 text-gray-400 font-normal text-xs">
                      {leave.total_days} วัน
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {formatDateTH(leave.start_date)}
                    {leave.start_date !== leave.end_date && ` – ${formatDateTH(leave.end_date)}`}
                  </p>
                </div>
                <span className={`badge ${LEAVE_STATUS_COLOR[leave.status as keyof typeof LEAVE_STATUS_COLOR]}`}>
                  {LEAVE_STATUS_LABEL[leave.status as keyof typeof LEAVE_STATUS_LABEL]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/leave/new" className="card p-4 hover:shadow-md transition-shadow text-center">
          <CalendarDays className="w-6 h-6 text-blue-600 mx-auto mb-1" />
          <p className="text-sm font-medium text-gray-800">ยื่นใบลา</p>
        </Link>
        <Link href={`/timesheet/${currentYear}/${currentMonth}`} className="card p-4 hover:shadow-md transition-shadow text-center">
          <Clock className="w-6 h-6 text-purple-600 mx-auto mb-1" />
          <p className="text-sm font-medium text-gray-800">กรอก Timesheet</p>
        </Link>
      </div>
    </div>
  )
}
