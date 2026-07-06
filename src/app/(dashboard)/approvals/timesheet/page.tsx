'use client'
// src/app/(dashboard)/approvals/timesheet/page.tsx
import { usePendingTimesheets }     from '@/hooks/useTimesheet'
import { TimesheetStatusBadge }     from '@/components/timesheet/TimesheetStatusBadge'
import { TimesheetApprovalPanel }   from '@/components/timesheet/TimesheetApprovalPanel'
import { formatMonthYearTH, fullNameTH } from '@/utils'
import { Loader2, ClipboardList, ChevronRight, Clock } from 'lucide-react'
import Link from 'next/link'

function useCurrentUserId() {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('hsc_session='))
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))?.id ?? ''
  } catch { return '' }
}

export default function ApprovalsTimesheetPage() {
  const userId  = useCurrentUserId()
  const { data, isLoading, refetch } = usePendingTimesheets()
  const timesheets = (data?.timesheets ?? []).filter(
    (ts: any) => ts.current_approver_id === userId || data?.timesheets
  )

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center gap-3">
        <ClipboardList className="w-5 h-5 text-gray-500" />
        <h1>รออนุมัติ Timesheet</h1>
        {timesheets.length > 0 && (
          <span className="badge bg-amber-100 text-amber-800">{timesheets.length} รายการ</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !timesheets.length ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">ไม่มีรายการรออนุมัติ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {timesheets.map((ts: any) => (
            <div key={ts.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
                  {ts.user?.first_name_th?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{fullNameTH(ts.user)}</p>
                  <p className="text-xs text-gray-400">{ts.user?.employee_code} · {ts.user?.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{formatMonthYearTH(ts.year, ts.month)}</p>
                  <div className="flex items-center gap-1 justify-end mt-0.5">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{ts.total_hours} ชม.</span>
                  </div>
                </div>
                <Link
                  href={`/timesheet/${ts.year}/${ts.month}`}
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  ดูรายละเอียด
                </Link>
              </div>

              {/* Inline approval panel */}
              <div className="p-4 bg-amber-50">
                <TimesheetApprovalPanel
                  timesheetId={ts.id}
                  approverId={ts.current_approver_id}
                  currentUserId={userId}
                  status={ts.status}
                  onDone={refetch}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
