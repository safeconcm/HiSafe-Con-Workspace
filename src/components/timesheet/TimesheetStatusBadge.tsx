'use client'
// src/components/timesheet/TimesheetStatusBadge.tsx
import { cn, TIMESHEET_STATUS_LABEL, TIMESHEET_STATUS_COLOR } from '@/utils'
import type { TimesheetStatus } from '@/types/database'

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  return (
    <span className={cn('badge', TIMESHEET_STATUS_COLOR[status])}>
      {TIMESHEET_STATUS_LABEL[status]}
    </span>
  )
}
