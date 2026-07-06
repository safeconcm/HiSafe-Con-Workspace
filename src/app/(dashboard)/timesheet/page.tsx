'use client'
// src/app/(dashboard)/timesheet/page.tsx
import { useMyTimesheets }        from '@/hooks/useTimesheet'
import { TimesheetStatusBadge }   from '@/components/timesheet/TimesheetStatusBadge'
import { formatMonthYearTH }      from '@/utils'
import { Loader2, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'

export default function TimesheetListPage() {
  const now   = new Date()
  const y     = now.getFullYear()
  const m     = now.getMonth() + 1
  const { data, isLoading } = useMyTimesheets()
  const timesheets = data?.timesheets ?? []

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between">
        <h1>Timesheet ของฉัน</h1>
        <Link
          href={`/timesheet/${y}/${m}`}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="w-4 h-4" />
          เดือนนี้
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !timesheets.length ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-gray-400">ยังไม่มี Timesheet</p>
          <Link
            href={`/timesheet/${y}/${m}`}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            เริ่มกรอก Timesheet เดือนนี้ →
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {timesheets.map((ts: any) => (
            <Link
              key={ts.id}
              href={`/timesheet/${ts.year}/${ts.month}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {formatMonthYearTH(ts.year, ts.month)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ts.total_hours} ชั่วโมง
                </p>
              </div>
              <TimesheetStatusBadge status={ts.status} />
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
