'use client'
// src/app/(dashboard)/timesheet/detail/[id]/page.tsx
// Read-only "view details" page for a SPECIFIC timesheet, addressed by id.
// Exists because /timesheet/[year]/[month] is the self-service editable page
// — it always resolves "my own timesheet for this year/month" from the
// session, ignoring which row was actually clicked. That made every
// "ดูรายละเอียด" link on /approvals/timesheet and /hr/timesheet silently
// redirect a supervisor/HR viewer to their OWN timesheet for that month
// instead of the employee's they meant to review — reported 2026-07-11
// (SC-002 clicking into SC-003's approved July 2026 timesheet landed on
// SC-002's own). This page fetches by timesheet id via GET /api/timesheet/:id
// (already authorized for the assigned/approving supervisor, HR, and admin —
// see that route) so it always shows the right person's data regardless of
// who's looking.
//
// The daily detail renders via TimesheetGrid (the same Job×Date matrix used
// by the personal month editor), disabled, instead of a flat per-line table
// — the flat table read as one row per day (up to ~26 rows) which the user
// flagged as too long compared to the compact grid they're used to seeing
// (see conversation 2026-07-11, "รูปแบบที่แสดง มันก็ยาวเกินไป ควรจะเอารูปแบบแสดง
// Timesheet เดิมมาแสดง"). GET /api/timesheet/:id now returns the same
// { timesheet, jobs, holidays, leaves, workingDays } shape as the
// by-month endpoint so this page can feed TimesheetGrid directly.

import { useParams, useRouter } from 'next/navigation'
import { useTimesheetDetail } from '@/hooks/useTimesheet'
import { TimesheetGrid } from '@/components/timesheet/TimesheetGrid'
import { TimesheetStatusBadge } from '@/components/timesheet/TimesheetStatusBadge'
import { TimesheetApprovalPanel } from '@/components/timesheet/TimesheetApprovalPanel'
import { LeaveTimeline } from '@/components/leave/LeaveTimeline'
import { formatMonthYearTH, formatDateTH, fullNameTH } from '@/utils'
import { ArrowLeft, Loader2, Download, FileSpreadsheet } from 'lucide-react'

function useCurrentUserId() {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('connex_session='))
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))?.id ?? ''
  } catch { return '' }
}

// TimesheetGrid calls onChange once on mount (and whenever its internal
// state changes) to report the edited lines back up — irrelevant here since
// the grid is always rendered disabled, so this just swallows it.
function noopChange() {}

export default function TimesheetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const userId = useCurrentUserId()

  const { data, isLoading } = useTimesheetDetail(id)

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  const ts = data?.timesheet

  if (!ts) return (
    <div className="page-container max-w-4xl">
      <div className="card p-8 text-center text-gray-400 text-sm">
        ไม่พบข้อมูล Timesheet
      </div>
    </div>
  )

  const jobs        = data?.jobs        ?? []
  const holidays     = data?.holidays    ?? []
  const leaves       = data?.leaves      ?? []
  const workingDays  = data?.workingDays ?? {}
  const lines        = ts.lines          ?? []

  return (
    <div className="page-container max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">{formatMonthYearTH(ts.year, ts.month)}</h1>
          <p className="text-sm text-gray-500">
            {fullNameTH(ts.user)} · {ts.user?.employee_code} · {ts.user?.department}
          </p>
        </div>
        <TimesheetStatusBadge status={ts.status} />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.open(`/api/pdf/timesheet/${ts.id}`, '_blank')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => window.open(`/api/timesheet/${ts.id}/export?format=xlsx`, '_blank')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Rejection reason */}
      {ts.status === 'rejected' && ts.rejection_reason && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">ถูกส่งคืน:</span> {ts.rejection_reason}
        </div>
      )}

      {/* Approval action panel — no-ops itself unless status is submitted
          and the viewer is the current assigned approver */}
      <TimesheetApprovalPanel
        timesheetId={ts.id}
        approverId={ts.current_approver_id}
        currentUserId={userId}
        status={ts.status}
        onDone={() => router.refresh()}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{ts.total_hours}</p>
          <p className="text-xs text-gray-500 mt-0.5">ชั่วโมงรวม</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{lines.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">รายการ</p>
        </div>
        {ts.status === 'approved' && ts.approved_by && (
          <div className="card p-4 text-center">
            <p className="text-sm font-medium text-gray-900">{fullNameTH(ts.approved_by)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              อนุมัติเมื่อ {ts.approved_at ? formatDateTH(ts.approved_at) : '-'}
            </p>
          </div>
        )}
      </div>

      {/* Daily detail — same Job×Date grid as the personal month editor,
          always disabled here since this page is read-only. */}
      <TimesheetGrid
        year={ts.year}
        month={ts.month}
        jobs={jobs}
        holidays={holidays}
        leaves={leaves}
        workingDays={workingDays}
        savedLines={lines}
        disabled
        onChange={noopChange}
      />

      {/* Approval history */}
      {ts.approvals?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-sm font-medium text-gray-700">ประวัติการอนุมัติ</h3>
          </div>
          <div className="card-body">
            <LeaveTimeline approvals={ts.approvals} status={ts.status} />
          </div>
        </div>
      )}
    </div>
  )
}
