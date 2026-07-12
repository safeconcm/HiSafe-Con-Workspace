'use client'
// src/app/(dashboard)/approvals/timesheet/page.tsx
import { useState } from 'react'
import { usePendingTimesheets, useApprovedTimesheets } from '@/hooks/useTimesheet'
import { TimesheetApprovalPanel }   from '@/components/timesheet/TimesheetApprovalPanel'
import { formatMonthYearTH, fullNameTH, cn } from '@/utils'
import { Loader2, ClipboardList, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

function useCurrentUserId() {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('connex_session='))
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))?.id ?? ''
  } catch { return '' }
}

export default function ApprovalsTimesheetPage() {
  const userId = useCurrentUserId()
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')

  const pending  = usePendingTimesheets()
  // Only fetch the approved-history tab's data once the user actually
  // switches to it — no point querying it on every load of this page.
  const approved = useApprovedTimesheets()

  const isPending = tab === 'pending'
  const { data, isLoading, refetch } = isPending ? pending : approved
  // The API (/api/hr/timesheet) already scopes both statuses correctly per
  // role — supervisors only ever get their own (current_approver_id for
  // pending, approved_by_id for history), HR/Admin get the whole company —
  // so no extra client-side filtering is needed here.
  const timesheets = data?.timesheets ?? []

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center gap-3 flex-wrap">
        <ClipboardList className="w-5 h-5 text-gray-500" />
        <h1>อนุมัติ Timesheet</h1>
        {isPending && timesheets.length > 0 && (
          <span className="badge bg-amber-100 text-amber-800">{timesheets.length} รายการ</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('pending')}
          className={cn('px-4 py-1.5 rounded-md text-sm transition-colors',
            isPending ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
        >
          รออนุมัติ
        </button>
        <button
          onClick={() => setTab('approved')}
          className={cn('px-4 py-1.5 rounded-md text-sm transition-colors',
            !isPending ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
        >
          อนุมัติแล้ว
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !timesheets.length ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">
            {isPending ? 'ไม่มีรายการรออนุมัติ' : 'ยังไม่มีรายการที่อนุมัติแล้ว'}
          </p>
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
                  href={`/timesheet/detail/${ts.id}`}
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  ดูรายละเอียด
                </Link>
              </div>

              {isPending ? (
                /* Inline approval panel */
                <div className="p-4 bg-amber-50">
                  <TimesheetApprovalPanel
                    timesheetId={ts.id}
                    approverId={ts.current_approver_id}
                    currentUserId={userId}
                    status={ts.status}
                    onDone={refetch}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-5 py-3 bg-green-50 text-green-700 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  อนุมัติแล้วเมื่อ {ts.approved_at ? new Date(ts.approved_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
