'use client'
// src/components/timesheet/TimesheetApprovalPanel.tsx
import { useState } from 'react'
import { useApproveTimesheet, useRejectTimesheet } from '@/hooks/useTimesheet'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/utils'

interface Props {
  timesheetId:   string
  approverId:    string | null
  currentUserId: string
  status:        string
  onDone?:       () => void
}

export function TimesheetApprovalPanel({ timesheetId, approverId, currentUserId, status, onDone }: Props) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason]         = useState('')
  const [comment, setComment]       = useState('')

  const approve = useApproveTimesheet()
  const reject  = useRejectTimesheet()

  if (status !== 'submitted' || approverId !== currentUserId) return null

  const handleApprove = async () => {
    await approve.mutateAsync({ id: timesheetId, comment: comment || undefined })
    onDone?.()
  }

  const handleReject = async () => {
    if (!reason.trim()) return
    await reject.mutateAsync({ id: timesheetId, rejection_reason: reason })
    setShowReject(false)
    onDone?.()
  }

  const busy = approve.isPending || reject.isPending

  return (
    <div className="card border-2 border-amber-200 bg-amber-50">
      <div className="card-header bg-amber-50 border-amber-100">
        <h3 className="text-sm font-medium text-amber-800">รอการพิจารณา Timesheet จากคุณ</h3>
      </div>
      <div className="card-body space-y-4">
        {!showReject ? (
          <>
            <div>
              <label className="form-label text-gray-600">หมายเหตุ (ถ้ามี)</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                className="form-input resize-none"
                placeholder="ระบุหมายเหตุในการอนุมัติ (ไม่บังคับ)"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                อนุมัติ
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                ส่งคืน
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="form-label">เหตุผลที่ส่งคืน <span className="text-red-500">*</span></label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="form-input resize-none"
                placeholder="กรุณาระบุเหตุผล..."
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReject(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleReject}
                disabled={!reason.trim() || busy}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {reject.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                ยืนยันส่งคืน
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
