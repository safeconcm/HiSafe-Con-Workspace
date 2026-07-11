'use client'
// src/app/(dashboard)/hr/timesheet/page.tsx
import { useState }              from 'react'
import { useQuery }              from '@tanstack/react-query'
import { TimesheetStatusBadge }  from '@/components/timesheet/TimesheetStatusBadge'
import { formatMonthYearTH, fullNameTH, cn } from '@/utils'
import { Loader2, Download, ChevronRight, Clock } from 'lucide-react'
import Link from 'next/link'

const STATUS_FILTERS = [
  { label: 'ทั้งหมด',     value: ''          },
  { label: 'รออนุมัติ',  value: 'submitted' },
  { label: 'อนุมัติแล้ว', value: 'approved'  },
  { label: 'ส่งคืน',      value: 'rejected'  },
  { label: 'ร่าง',        value: 'draft'     },
]

async function fetchHRTimesheets(params: Record<string, string>) {
  const qs = new URLSearchParams(params)
  const res = await fetch(`/api/hr/timesheet?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export default function HRTimesheetPage() {
  const now = new Date()
  const [year,   setYear]   = useState(now.getFullYear())
  const [month,  setMonth]  = useState(0) // 0 = all months
  const [status, setStatus] = useState('')
  const [page,   setPage]   = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['hr-timesheets', year, month, status, page],
    queryFn: () => fetchHRTimesheets({
      year:  String(year),
      ...(month  && { month:  String(month)  }),
      ...(status && { status: status         }),
      page:  String(page),
      limit: '30',
    }),
  })

  const timesheets = data?.timesheets ?? []
  const total      = data?.total ?? 0
  const years      = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)
  const months     = Array.from({ length: 12 }, (_, i) => i + 1)

  const handleExport = () => {
    const qs = new URLSearchParams({
      year: String(year),
      ...(month && { month: String(month) }),
    })
    window.open(`/api/hr/timesheet/export?${qs}`, '_blank')
  }

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1>Timesheet ทั้งหมด</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setStatus(f.value); setPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                status === f.value
                  ? 'bg-blue-700 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select value={year} onChange={e => { setYear(Number(e.target.value)); setPage(1) }} className="form-input w-auto">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={month} onChange={e => { setMonth(Number(e.target.value)); setPage(1) }} className="form-input w-auto">
          <option value={0}>ทุกเดือน</option>
          {months.map(m => (
            <option key={m} value={m}>{formatMonthYearTH(year, m)}</option>
          ))}
        </select>

        <span className="text-sm text-gray-400">ทั้งหมด {total} รายการ</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <th>เดือน</th>
                  <th className="text-center">ชั่วโมง</th>
                  <th>สถานะ</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((ts: any) => (
                  <tr key={ts.id}>
                    <td>
                      <p className="text-sm font-medium text-gray-900">{fullNameTH(ts.user)}</p>
                      <p className="text-xs text-gray-400">{ts.user?.employee_code} · {ts.user?.department}</p>
                    </td>
                    <td className="text-sm text-gray-700 whitespace-nowrap">
                      {formatMonthYearTH(ts.year, ts.month)}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{ts.total_hours}</span>
                      </div>
                    </td>
                    <td><TimesheetStatusBadge status={ts.status} /></td>
                    <td>
                      <Link
                        href={`/timesheet/detail/${ts.id}`}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!timesheets.length && (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                      ไม่พบรายการ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden divide-y divide-gray-100">
            {timesheets.map((ts: any) => (
              <Link
                key={ts.id}
                href={`/timesheet/detail/${ts.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{fullNameTH(ts.user)}</p>
                  <p className="text-xs text-gray-400">
                    {formatMonthYearTH(ts.year, ts.month)} · {ts.total_hours} ชม.
                  </p>
                </div>
                <TimesheetStatusBadge status={ts.status} />
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 30 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">
            ก่อนหน้า
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">หน้า {page} / {Math.ceil(total / 30)}</span>
          <button disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">
            ถัดไป
          </button>
        </div>
      )}
    </div>
  )
}
