'use client'
// src/components/leave/LeaveListTable.tsx
import Link from 'next/link'
import { LeaveStatusBadge, LeaveTypeBadge } from './LeaveStatusBadge'
import { formatDateRangeTH, formatDays, fullNameTH } from '@/utils'
import { FileText, ChevronRight } from 'lucide-react'

interface LeaveRow {
  id: string
  leave_type: string
  status: string
  start_date: string
  end_date: string
  total_days: number
  is_half_day: boolean
  reason: string | null
  user?: { first_name_th: string; last_name_th: string; employee_code: string }
  created_at: string
}

interface Props {
  leaves: LeaveRow[]
  showUser?: boolean   // HR/Supervisor view shows employee name
}

export function LeaveListTable({ leaves, showUser = false }: Props) {
  if (!leaves.length) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <FileText className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">ยังไม่มีประวัติการลา</p>
        <p className="text-xs text-gray-400 mt-1">เมื่อยื่นใบลาแล้วจะแสดงที่นี่</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {showUser && <th>พนักงาน</th>}
              <th>ประเภท</th>
              <th>วันที่</th>
              <th>จำนวน</th>
              <th>สถานะ</th>
              <th>เหตุผล</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(leave => (
              <tr key={leave.id}>
                {showUser && leave.user && (
                  <td>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {fullNameTH(leave.user)}
                      </p>
                      <p className="text-xs text-gray-400">{leave.user.employee_code}</p>
                    </div>
                  </td>
                )}
                <td>
                  <LeaveTypeBadge type={leave.leave_type as any} />
                </td>
                <td className="text-gray-700 text-sm whitespace-nowrap">
                  {formatDateRangeTH(leave.start_date, leave.end_date)}
                  {leave.is_half_day && <span className="ml-1 text-xs text-gray-400">(ครึ่งวัน)</span>}
                </td>
                <td className="text-sm text-gray-700 whitespace-nowrap">
                  {formatDays(leave.total_days)}
                </td>
                <td>
                  <LeaveStatusBadge status={leave.status as any} />
                </td>
                <td className="text-sm text-gray-500 max-w-[200px] truncate">
                  {leave.reason ?? '—'}
                </td>
                <td>
                  <Link href={`/leave/${leave.id}`} className="text-gray-400 hover:text-gray-700">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-gray-100">
        {leaves.map(leave => (
          <Link
            key={leave.id}
            href={`/leave/${leave.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              {showUser && leave.user && (
                <p className="text-xs text-gray-400 mb-0.5">{fullNameTH(leave.user)}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <LeaveTypeBadge type={leave.leave_type as any} />
                <span className="text-xs text-gray-400">{formatDays(leave.total_days)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDateRangeTH(leave.start_date, leave.end_date)}
                {leave.is_half_day && ' (ครึ่งวัน)'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LeaveStatusBadge status={leave.status as any} />
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
