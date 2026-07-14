'use client'
// src/app/(dashboard)/hr/leave/page.tsx
import { useState }        from 'react'
import { useLeaves }       from '@/hooks/useLeave'
import { LeaveListTable }  from '@/components/leave/LeaveListTable'
import { Loader2, Download, Search } from 'lucide-react'
import { cn }              from '@/utils'
import type { LeaveType }  from '@/types/database'
import { LEAVE_TYPE_LABEL } from '@/utils'

const LEAVE_TYPES: { label: string; value: string }[] = [
  { label: 'ทุกประเภท', value: '' },
  { label: LEAVE_TYPE_LABEL.annual,    value: 'annual'    },
  { label: LEAVE_TYPE_LABEL.sick,      value: 'sick'      },
  { label: LEAVE_TYPE_LABEL.personal,  value: 'personal'  },
  { label: LEAVE_TYPE_LABEL.maternity, value: 'maternity' },
]

const STATUS_FILTERS = [
  { label: 'ทั้งหมด',        value: ''          },
  { label: 'รออนุมัติ',     value: 'pending'   },
  { label: 'อนุมัติแล้ว',    value: 'approved'  },
  { label: 'ไม่อนุมัติ',     value: 'rejected'  },
  // 2026-07-14: HR's 2nd-step check queue — not a real `status` value (see
  // hr_check comment in src/app/api/leave/route.ts), handled separately
  // below rather than through the normal status filter.
  { label: 'รอ HR ตรวจสอบ', value: 'hr_pending' },
]

export default function HRLeavePage() {
  const [status,    setStatus]    = useState('')
  const [leaveType, setLeaveType] = useState('')
  const [year,      setYear]      = useState(new Date().getFullYear())
  const [page,      setPage]      = useState(1)

  const isHRPendingTab = status === 'hr_pending'

  const { data, isLoading } = useLeaves({
    status:     (!isHRPendingTab && status) || undefined,
    hrCheck:    isHRPendingTab ? 'pending' : undefined,
    leave_type: leaveType  || undefined,
    year,
    page,
    limit: 30,
  })

  const leaves = data?.requests ?? []
  const total  = data?.total ?? 0
  const years  = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i)

  const handleExport = async () => {
    const qs = new URLSearchParams({
      format: 'excel',
      year:   String(year),
      // 'hr_pending' isn't a real leave_requests.status value (see
      // hr_check comment in src/app/api/leave/route.ts) — the export
      // endpoint doesn't understand it, so skip the status filter for that
      // tab rather than sending a status it can't match.
      ...(status && !isHRPendingTab && { status }),
      ...(leaveType  && { leave_type: leaveType }),
    })
    window.open(`/api/hr/leave/export?${qs}`, '_blank')
  }

  return (
    <div className="page-container space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1>จัดการใบลา</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Status */}
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

        {/* Leave type */}
        <select
          value={leaveType}
          onChange={e => { setLeaveType(e.target.value); setPage(1) }}
          className="form-input w-auto"
        >
          {LEAVE_TYPES.map(lt => (
            <option key={lt.value} value={lt.value}>{lt.label}</option>
          ))}
        </select>

        {/* Year */}
        <select
          value={year}
          onChange={e => { setYear(Number(e.target.value)); setPage(1) }}
          className="form-input w-auto"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <span className="text-sm text-gray-400 self-center">
          ทั้งหมด {total} รายการ
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <LeaveListTable leaves={leaves} showUser />
      )}

      {/* Pagination */}
      {total > 30 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ก่อนหน้า
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            หน้า {page} / {Math.ceil(total / 30)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 30)}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  )
}
