'use client'
// src/components/leave/LeaveTimeline.tsx
import { formatDateTime } from '@/utils'
import { CheckCircle2, XCircle, Clock, Zap, User } from 'lucide-react'
import { cn } from '@/utils'

interface ApprovalRecord {
  id: string
  action: string
  comment: string | null
  sequence: number
  acted_at: string
  approver_name: string | null
  approver?: { first_name_th: string; last_name_th: string } | null
}

interface Props {
  approvals: ApprovalRecord[]
  status: string
}

const ACTION_ICON: Record<string, React.ElementType> = {
  approved:     CheckCircle2,
  rejected:     XCircle,
  cancelled:    XCircle,
  noted:        User,
  auto_approved: Zap,
}

const ACTION_COLOR: Record<string, string> = {
  approved:     'text-green-600 bg-green-100',
  rejected:     'text-red-600 bg-red-100',
  cancelled:    'text-gray-500 bg-gray-100',
  noted:        'text-blue-600 bg-blue-100',
  auto_approved:'text-purple-600 bg-purple-100',
}

const ACTION_LABEL: Record<string, string> = {
  approved:     'อนุมัติ',
  rejected:     'ไม่อนุมัติ',
  cancelled:    'ยกเลิก',
  noted:        'รับทราบ',
  auto_approved:'อนุมัติอัตโนมัติ (CEO)',
}

export function LeaveTimeline({ approvals, status }: Props) {
  if (!approvals.length) {
    if (status === 'pending') {
      return (
        <div className="flex items-center gap-3 py-4">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-sm text-gray-600">รออนุมัติจากหัวหน้างาน</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-3">
      {approvals
        .sort((a, b) => new Date(a.acted_at).getTime() - new Date(b.acted_at).getTime())
        .map((ap, idx) => {
          const Icon = ACTION_ICON[ap.action] ?? User
          const colorClass = ACTION_COLOR[ap.action] ?? 'text-gray-600 bg-gray-100'
          const name = ap.approver
            ? `${ap.approver.first_name_th} ${ap.approver.last_name_th}`
            : ap.approver_name ?? 'ระบบ'

          return (
            <div key={ap.id} className="flex items-start gap-3">
              {/* Icon */}
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', colorClass)}>
                <Icon className="w-4 h-4" />
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{name}</span>
                  {' '}
                  <span className="text-gray-500">{ACTION_LABEL[ap.action] ?? ap.action}</span>
                </p>
                {ap.comment && (
                  <p className="text-xs text-gray-500 mt-0.5 bg-gray-50 rounded px-2 py-1 mt-1">
                    "{ap.comment}"
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateTime(ap.acted_at)}
                </p>
              </div>
            </div>
          )
        })}
    </div>
  )
}
