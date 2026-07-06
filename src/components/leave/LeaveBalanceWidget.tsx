'use client'
// src/components/leave/LeaveBalanceWidget.tsx
import { useLeaveBalance } from '@/hooks/useLeave'
import { LEAVE_TYPE_LABEL, formatDays } from '@/utils'
import type { LeaveType } from '@/types/database'
import { CalendarDays, TrendingUp, Loader2 } from 'lucide-react'

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal']

const COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  annual:   { bg: 'bg-blue-50',   text: 'text-blue-700',  bar: 'bg-blue-500'  },
  sick:     { bg: 'bg-red-50',    text: 'text-red-700',   bar: 'bg-red-400'   },
  personal: { bg: 'bg-amber-50',  text: 'text-amber-700', bar: 'bg-amber-400' },
}

interface Props {
  year?: number
  compact?: boolean
}

export function LeaveBalanceWidget({ year, compact = false }: Props) {
  const currentYear = year ?? new Date().getFullYear()
  const { data, isLoading } = useLeaveBalance(currentYear)
  const balances: any[] = data?.balances ?? []

  if (isLoading) {
    return (
      <div className="card p-4 flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  const getBalance = (type: LeaveType) =>
    balances.find(b => b.leave_type === type)

  if (compact) {
    return (
      <div className="flex gap-3 flex-wrap">
        {LEAVE_TYPES.map(type => {
          const b = getBalance(type)
          const available = b?.available_days ?? 0
          const total     = b ? b.quota_days + b.carried_forward : 0
          const c         = COLORS[type]
          return (
            <div key={type} className={`card px-4 py-3 flex items-center gap-3 ${c.bg} border-0`}>
              <div>
                <p className={`text-xl font-bold leading-none ${c.text}`}>{available}</p>
                <p className="text-xs text-gray-500 mt-0.5">{LEAVE_TYPE_LABEL[type]}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-700">วันลาคงเหลือ ปี {currentYear}</h3>
        </div>
      </div>
      <div className="card-body space-y-4">
        {LEAVE_TYPES.map(type => {
          const b = getBalance(type)
          if (!b) return null
          const available = b.available_days ?? 0
          const total     = b.quota_days + b.carried_forward + b.adjusted_days
          const used      = b.used_days
          const pending   = b.pending_days
          const pct       = total > 0 ? Math.min((used / total) * 100, 100) : 0
          const c         = COLORS[type]

          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-700">{LEAVE_TYPE_LABEL[type]}</span>
                <span className={`text-sm font-semibold ${c.text}`}>
                  {available} <span className="font-normal text-gray-400">/ {total} วัน</span>
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${c.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-4 mt-1">
                <span className="text-xs text-gray-400">ใช้แล้ว {used} วัน</span>
                {pending > 0 && (
                  <span className="text-xs text-amber-500">รออนุมัติ {pending} วัน</span>
                )}
                {b.carried_forward > 0 && (
                  <span className="text-xs text-blue-400">สะสม +{b.carried_forward} วัน</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
