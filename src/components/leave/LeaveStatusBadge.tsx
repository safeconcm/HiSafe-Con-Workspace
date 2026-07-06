'use client'
// src/components/leave/LeaveStatusBadge.tsx
import { cn, LEAVE_STATUS_LABEL, LEAVE_STATUS_COLOR, LEAVE_TYPE_LABEL, LEAVE_TYPE_COLOR } from '@/utils'
import type { LeaveStatus, LeaveType } from '@/types/database'

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span className={cn('badge', LEAVE_STATUS_COLOR[status])}>
      {LEAVE_STATUS_LABEL[status]}
    </span>
  )
}

export function LeaveTypeBadge({ type }: { type: LeaveType }) {
  return (
    <span className={cn('badge', LEAVE_TYPE_COLOR[type])}>
      {LEAVE_TYPE_LABEL[type]}
    </span>
  )
}
