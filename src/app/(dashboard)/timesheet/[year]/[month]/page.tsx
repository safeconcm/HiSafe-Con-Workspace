'use client'
// src/app/(dashboard)/timesheet/[year]/[month]/page.tsx
import { useParams, useRouter }       from 'next/navigation'
import { useState, useRef, useCallback } from 'react'
import { useMonthTimesheet, useSaveTimesheetLines, useSubmitTimesheet } from '@/hooks/useTimesheet'
import { TimesheetGrid }              from '@/components/timesheet/TimesheetGrid'
import { TimesheetStatusBadge }       from '@/components/timesheet/TimesheetStatusBadge'
import { TimesheetApprovalPanel }     from '@/components/timesheet/TimesheetApprovalPanel'
import { LeaveTimeline }              from '@/components/leave/LeaveTimeline'
import { formatMonthYearTH, cn }      from '@/utils'
import {
  ArrowLeft, ArrowRight, Save, Send,
  Loader2, Download, Clock, FileSpreadsheet
} from 'lucide-react'
import Link from 'next/link'

function useCurrentUserId() {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('hsc_session='))
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))?.id ?? ''
  } catch { return '' }
}

export default function TimesheetMonthPage() {
  const params  = useParams()
  const router  = useRouter()
  const year    = parseInt(params.year as string)
  const month   = parseInt(params.month as string)
  const userId  = useCurrentUserId()

  const { data, isLoading, refetch } = useMonthTimesheet(year, month)

  const ts         = data?.timesheet
  const jobs       = data?.jobs       ?? []
  const holidays   = data?.holidays   ?? []
  const leaves     = data?.leaves     ?? []
  const lines      = ts?.lines        ?? []
  const workingDays = data?.workingDays ?? {}

  const pendingLines   = useRef<any[]>([])
  const handleChange   = useCallback((l: any[]) => { pendingLines.current = l }, [])

  const save   = useSaveTimesheetLines(ts?.id ?? '')
  const submit = useSubmitTimesheet(ts?.id ?? '', year, month)

  const [submitting, setSubmitting] = useState(false)

  const handleSave = async () => {
    if (!ts?.id) return
    await save.mutateAsync(pendingLines.current)
    await refetch()
  }

  const handleSubmit = async () => {
    if (!ts?.id) return
    setSubmitting(true)
    await handleSave()
    await submit.mutateAsync()
    await refetch()
    setSubmitting(false)
  }

  const disabled = !!ts && !['draft', 'rejected'].includes(ts.status)

  // Nav: prev / next month
  const prevMonth = month === 1  ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const nextMonth = month === 12 ? { y: year + 1, m: 1  } : { y: year, m: month + 1 }
  const now = new Date()
  const isFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="page-container max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/timesheet" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>

        {/* Month navigator */}
        <div className="flex items-center gap-1">
          <Link
            href={`/timesheet/${prevMonth.y}/${prevMonth.m}`}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold px-2">
            {formatMonthYearTH(year, month)}
          </h1>
          {!isFuture && (
            <Link
              href={`/timesheet/${nextMonth.y}/${nextMonth.m}`}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {ts && <TimesheetStatusBadge status={ts.status} />}

        <div className="ml-auto flex items-center gap-2">
          {/* PDF download — renders on demand via /api/pdf/timesheet/:id
              (see src/lib/pdf/render.ts); not the raw ts.pdf_url storage
              path, which points into a private bucket the browser can't
              fetch directly. */}
          {ts && (
            <button
              type="button"
              onClick={() => window.open(`/api/pdf/timesheet/${ts.id}`, '_blank')}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              ดาวน์โหลด PDF
            </button>
          )}
          {/* Excel / CSV export — same job x date matrix as the PDF, via
              /api/timesheet/:id/export (see route for details) */}
          {ts && (
            <>
              <button
                type="button"
                onClick={() => window.open(`/api/timesheet/${ts.id}/export?format=xlsx`, '_blank')}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </button>
              <button
                type="button"
                onClick={() => window.open(`/api/timesheet/${ts.id}/export?format=csv`, '_blank')}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                CSV
              </button>
            </>
          )}
          {/* Save button */}
          {!disabled && (
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              บันทึก
            </button>
          )}
          {/* Submit button */}
          {!disabled && (
            <button
              onClick={handleSubmit}
              disabled={submitting || save.isPending}
              className="flex items-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              ส่งอนุมัติ
            </button>
          )}
        </div>
      </div>

      {/* Rejection reason */}
      {ts?.status === 'rejected' && ts.rejection_reason && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">ถูกส่งคืน:</span> {ts.rejection_reason}
        </div>
      )}

      {/* Approval panel */}
      {ts && (
        <TimesheetApprovalPanel
          timesheetId={ts.id}
          approverId={ts.current_approver_id}
          currentUserId={userId}
          status={ts.status}
          onDone={refetch}
        />
      )}

      {/* Summary row */}
      {ts && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{ts.total_hours}</p>
            <p className="text-xs text-gray-500 mt-0.5">ชั่วโมงรวม</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-green-700">
              {lines.filter((l: any) => l.line_type === 'leave').length > 0
                ? leaves.reduce((s: number, lv: any) => s + lv.total_days, 0)
                : 0}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">วันลา</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{holidays.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">วันหยุด</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {ts ? (
        <TimesheetGrid
          year={year}
          month={month}
          jobs={jobs}
          holidays={holidays}
          leaves={leaves}
          workingDays={workingDays}
          savedLines={lines}
          disabled={disabled}
          onChange={handleChange}
        />
      ) : (
        <div className="card p-8 text-center text-gray-400 text-sm">
          ไม่พบข้อมูล Timesheet
        </div>
      )}

      {/* Approval history */}
      {ts?.approvals?.length > 0 && (
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
