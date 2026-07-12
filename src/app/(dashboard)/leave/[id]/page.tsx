'use client'
// src/app/(dashboard)/leave/[id]/page.tsx
import { useParams, useRouter } from 'next/navigation'
import { useLeave, useCancelLeave } from '@/hooks/useLeave'
import { LeaveStatusBadge, LeaveTypeBadge } from '@/components/leave/LeaveStatusBadge'
import { LeaveApprovalPanel }              from '@/components/leave/LeaveApprovalPanel'
import { LeaveSignatureSection }          from '@/components/leave/LeaveSignatureSection'
import { LeaveTimeline }                   from '@/components/leave/LeaveTimeline'
import {
  formatDateRangeTH, formatDateTime, formatDays,
  fullNameTH,
} from '@/utils'
import { ArrowLeft, Download, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

// Get current user id from session cookie (client-side)
function useCurrentUserId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('connex_session='))
    if (!raw) return ''
    const session = JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))
    return session?.id ?? ''
  } catch { return '' }
}

export default function LeaveDetailPage() {
  const params        = useParams()
  const router        = useRouter()
  const id            = params.id as string
  const currentUserId = useCurrentUserId()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data, isLoading, refetch } = useLeave(id)
  const cancel = useCancelLeave()

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) return (
    <div className="page-container">
      <p className="text-gray-500">ไม่พบข้อมูลใบลา</p>
    </div>
  )

  const leave    = data
  const canCancel = leave.user_id === currentUserId &&
    ['draft', 'pending', 'approved'].includes(leave.status)

  const handleCancel = async () => {
    await cancel.mutateAsync({ id })
    router.push('/leave/my')
  }

  return (
    <div className="page-container max-w-2xl space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/leave/my" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold">ใบลา</h1>
            <LeaveTypeBadge   type={leave.leave_type} />
            <LeaveStatusBadge status={leave.status}   />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            ยื่นเมื่อ {formatDateTime(leave.created_at)}
          </p>
        </div>
        {/* PDF download — renders on demand via /api/pdf/leave/:id (see
            src/lib/pdf/render.ts); not the raw leave.pdf_url storage path,
            which points into a private bucket the browser can't fetch
            directly. */}
        <button
          type="button"
          onClick={() => window.open(`/api/pdf/leave/${id}`, '_blank')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          ดาวน์โหลด PDF
        </button>
      </div>

      {/* Employee info */}
      {leave.user && (
        <div className="card card-body flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm shrink-0">
            {leave.user.first_name_th.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{fullNameTH(leave.user)}</p>
            <p className="text-xs text-gray-400">
              {leave.user.employee_code}
              {leave.user.department && ` · ${leave.user.department}`}
            </p>
          </div>
        </div>
      )}

      {/* Leave details */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-medium text-gray-700">รายละเอียดการลา</h3>
        </div>
        <div className="card-body grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs mb-0.5">ช่วงเวลา</p>
            <p className="text-gray-900 font-medium">
              {formatDateRangeTH(leave.start_date, leave.end_date)}
              {leave.is_half_day && (
                <span className="ml-1 text-gray-500">
                  ({leave.half_day_period === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย'})
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">จำนวนวัน</p>
            <p className="text-gray-900 font-medium">{formatDays(leave.total_days)}</p>
          </div>
          {leave.reason && (
            <div className="col-span-2">
              <p className="text-gray-400 text-xs mb-0.5">เหตุผล</p>
              <p className="text-gray-900">{leave.reason}</p>
            </div>
          )}
          {leave.rejection_reason && (
            <div className="col-span-2">
              <p className="text-gray-400 text-xs mb-0.5">เหตุผลที่ไม่อนุมัติ</p>
              <p className="text-red-700 bg-red-50 rounded px-3 py-2">{leave.rejection_reason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Approval panel (for assigned approver) */}
      <LeaveApprovalPanel
        leaveId={id}
        approverId={leave.current_approver_id}
        currentUserId={currentUserId}
        status={leave.status}
        onDone={() => refetch()}
      />

      {/* Approval timeline */}
      {(leave.approvals?.length > 0 || leave.status === 'pending') && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-sm font-medium text-gray-700">ประวัติการอนุมัติ</h3>
          </div>
          <div className="card-body">
            <LeaveTimeline approvals={leave.approvals ?? []} status={leave.status} />
          </div>
        </div>
      )}

      {/* e-Signature */}
      <LeaveSignatureSection
        status={leave.status}
        employeeName={leave.user ? fullNameTH(leave.user) : ''}
        employeeSignedUrl={leave.signature_employee_signed_url ?? null}
        employeeSignedAt={leave.signature_employee_at ?? null}
        approverName={leave.approved_by ? fullNameTH(leave.approved_by) : null}
        approverSignedUrl={leave.signature_approver_signed_url ?? null}
        approverSignedAt={leave.signature_approver_at ?? null}
      />

      {/* Cancel */}
      {canCancel && (
        <div className="card border-red-200">
          <div className="card-body">
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                ยกเลิกใบลานี้
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  {leave.status === 'approved'
                    ? 'ใบลาที่อนุมัติแล้วจะต้องรอหัวหน้างานยืนยันการยกเลิกอีกครั้ง'
                    : 'ยืนยันการยกเลิกใบลานี้?'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    ไม่ยกเลิก
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancel.isPending}
                    className="flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                  >
                    {cancel.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    ยืนยันยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
