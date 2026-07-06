'use client'
// src/app/(dashboard)/leave/team/page.tsx
// Team leave calendar — supervisor sees subordinates' approved leaves

import { useState }        from 'react'
import { useQuery }        from '@tanstack/react-query'
import { getDaysInMonth, isWeekend, toISODate, LEAVE_TYPE_LABEL, LEAVE_TYPE_COLOR, cn, formatDays } from '@/utils'
import { CalendarDays, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { LeaveType } from '@/types/database'

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const TH_DAYS_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส']

async function fetchTeamLeaves(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`
  const endDate   = new Date(year, month, 0).toISOString().split('T')[0]
  const res  = await fetch(
    `/api/leave?status=approved&limit=100` +
    `&year=${year}`
  )
  const json = await res.json()
  return (json.data?.requests ?? []).filter((r: any) =>
    r.start_date <= endDate && r.end_date >= startDate
  )
}

async function fetchHolidays(year: number, month: number) {
  const res  = await fetch(`/api/hr/holidays?year=${year}`)
  const json = await res.json()
  const m    = String(month).padStart(2,'0')
  return (json.data?.holidays ?? []).filter((h: any) =>
    h.holiday_date.startsWith(`${year}-${m}`)
  )
}

export default function TeamLeavePage() {
  const now   = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data: leaves   = [], isLoading: l1 } = useQuery({
    queryKey: ['team-leaves', year, month],
    queryFn:  () => fetchTeamLeaves(year, month),
  })
  const { data: holidays = [], isLoading: l2 } = useQuery({
    queryKey: ['holidays-month', year, month],
    queryFn:  () => fetchHolidays(year, month),
  })

  const days = getDaysInMonth(year, month)
  const holidaySet = new Set((holidays as any[]).map((h: any) => h.holiday_date))

  // Build: Map<userId, { name, leaves: Map<dateStr, leaveType> }>
  const userMap = new Map<string, { name: string; emp_code: string; dates: Map<string, string> }>()
  ;(leaves as any[]).forEach(lv => {
    const uid  = lv.user_id
    const name = `${lv.user?.first_name_th ?? ''} ${lv.user?.last_name_th ?? ''}`.trim()
    if (!userMap.has(uid)) {
      userMap.set(uid, { name, emp_code: lv.user?.employee_code ?? '', dates: new Map() })
    }
    // Mark each date
    const start = new Date(lv.start_date)
    const end   = new Date(lv.end_date)
    const cur   = new Date(start)
    while (cur <= end) {
      const ds = toISODate(cur)
      userMap.get(uid)!.dates.set(ds, lv.leave_type)
      cur.setDate(cur.getDate() + 1)
    }
  })

  const users = Array.from(userMap.entries())

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="page-container space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <CalendarDays className="w-5 h-5 text-gray-500" />
        <h1>ปฏิทินทีม</h1>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-800 px-2 min-w-[100px] text-center">
            {TH_MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(['annual','sick','personal','maternity'] as LeaveType[]).map(lt => (
          <div key={lt} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className={cn('w-3 h-3 rounded-sm', LEAVE_TYPE_COLOR[lt].split(' ')[0])} />
            {LEAVE_TYPE_LABEL[lt]}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-sm bg-red-100" />
          วันหยุด
        </div>
      </div>

      {/* Calendar grid */}
      {l1 || l2 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: `${users.length > 0 ? 120 + days.length * 32 : 400}px` }}>
              <thead>
                {/* Day-of-week row */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-gray-50 min-w-[120px]">
                    พนักงาน
                  </th>
                  {days.map(day => {
                    const ds  = toISODate(day)
                    const dow = day.getDay()
                    const isHoliday = holidaySet.has(ds)
                    return (
                      <th
                        key={ds}
                        className={cn(
                          'text-center px-0.5 py-1.5 font-normal min-w-[28px]',
                          dow === 0 || dow === 6 ? 'text-gray-300' :
                          isHoliday ? 'text-red-400' : 'text-gray-500'
                        )}
                      >
                        <div>{day.getDate()}</div>
                        <div className="text-[9px]">{TH_DAYS_SHORT[dow]}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {!users.length ? (
                  <tr>
                    <td colSpan={days.length + 1} className="text-center py-10 text-gray-400">
                      ไม่มีข้อมูลการลาในเดือนนี้
                    </td>
                  </tr>
                ) : users.map(([uid, u]) => (
                  <tr key={uid} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 sticky left-0 bg-white border-r border-gray-100">
                      <p className="font-medium text-gray-900 truncate max-w-[110px]">{u.name}</p>
                      <p className="text-gray-400 text-[10px]">{u.emp_code}</p>
                    </td>
                    {days.map(day => {
                      const ds        = toISODate(day)
                      const dow       = day.getDay()
                      const isHoliday = holidaySet.has(ds)
                      const leaveType = u.dates.get(ds)

                      let cellClass = ''
                      if (leaveType) {
                        const colorMap: Record<string, string> = {
                          annual: 'bg-blue-200', sick: 'bg-red-200',
                          personal: 'bg-amber-200', maternity: 'bg-pink-200', other: 'bg-gray-200',
                        }
                        cellClass = colorMap[leaveType] ?? 'bg-purple-200'
                      } else if (isHoliday) {
                        cellClass = 'bg-red-50'
                      } else if (isWeekend(day)) {
                        cellClass = 'bg-gray-50'
                      }

                      return (
                        <td key={ds} className={cn('px-0.5 py-1', cellClass)}>
                          {leaveType && (
                            <div className="w-full h-5 rounded-sm flex items-center justify-center">
                              <span className="text-[9px] font-medium text-gray-700">
                                {LEAVE_TYPE_LABEL[leaveType as LeaveType]?.charAt(0)}
                              </span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          {users.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
              <span>มีพนักงานลา {users.length} คนในเดือนนี้</span>
              <span>|</span>
              <Link href="/hr/leave" className="text-blue-600 hover:underline">
                ดูรายการใบลาทั้งหมด →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Link to pending */}
      <div className="flex gap-3">
        <Link href="/approvals/leave"
          className="card px-4 py-3 flex items-center gap-2 text-sm text-gray-700 hover:shadow-md transition-shadow">
          <CalendarDays className="w-4 h-4 text-amber-500" />
          ดูใบลารออนุมัติ
        </Link>
        <Link href="/leave/my"
          className="card px-4 py-3 flex items-center gap-2 text-sm text-gray-700 hover:shadow-md transition-shadow">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          ใบลาของฉัน
        </Link>
      </div>
    </div>
  )
}
