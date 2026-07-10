'use client'
// src/app/(dashboard)/leave/my/page.tsx
import { useState }              from 'react'
import { useLeaves }             from '@/hooks/useLeave'
import { LeaveListTable }        from '@/components/leave/LeaveListTable'
import { LeaveBalanceWidget }    from '@/components/leave/LeaveBalanceWidget'
import { Loader2, Plus, Filter } from 'lucide-react'
import Link                      from 'next/link'
import { cn }                    from '@/utils'
import type { LeaveStatus }      from '@/types/database'

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'ทั้งหมด',     value: ''          },
  { label: 'รออนุมัติ',  value: 'pending'   },
  { label: 'อนุมัติแล้ว', value: 'approved'  },
  { label: 'ไม่อนุมัติ',  value: 'rejected'  },
  { label: 'ยกเลิกแล้ว', value: 'cancelled' },
]

export default function MyLeavePage() {
  const [status, setStatus] = useState('')
  const [year, setYear]     = useState(new Date().getFullYear())

  const { data, isLoading } = useLeaves({ status: status || undefined, year, limit: 50, ownOnly: true })
  const leaves = data?.requests ?? []

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="page-container space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">ใบลาของฉัน</h1>
        <Link
          href="/leave/new"
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          ยื่นใบลาใหม่
        </Link>
      </div>

      {/* Balance widget */}
      <LeaveBalanceWidget year={year} />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
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

        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="form-input w-auto"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <LeaveListTable leaves={leaves} />
      )}
    </div>
  )
}
