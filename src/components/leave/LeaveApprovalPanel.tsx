'use client'
// src/components/leave/LeaveApprovalPanel.tsx
import { useState }        from 'react'
import { useApproveLeave, useRejectLeave } from '@/hooks/useLeave'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/utils'

interface Props {
  leaveId:     string
  approverId:  string | null
  currentUserId: string
  status:      string
  onDone?:     () => void
}

export function LeaveApprovalPanel({ leaveId, approverId, currentUserId, status, onDone }: Props) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason]         = useState('')
  const [comment, setComment]       = useState('')

  const approve = useApproveLeave()
  const reject  = useRejectLeave()

  // Only show if this user is the assigned approver and status is pending
  if (status !== 'pending' || approverId !== currentUserId) return null

  const handleApprove = async () => {
    await approve.mutateAsync({ id: leaveId, comment: comment || undefined })
    onDone?.()
  }

  const handleReject = async () => {
    if (!reason.trim()) return
    await reject.mutateAsync({ id: leaveId, rejection_reason: reason })
    setShowReject(false)
    onDone?.()
  }

  const isLoading = approve.isPending || reject.isPending

  return (
    <div className="card border-2 border-amber-200 bg-amber-50">
      <div className="card-header bg-amber-50 border-amber-100">
        <h3 className="text-sm font-medium text-amber-800">รอการพิจารณาจากคุณ</h3>
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
                disabled={isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg',
                  'bg-green-600 text-white px-4 py-2.5 text-sm font-medium',
                  'hover:bg-green-700 disabled:opacity-60 transition-colors'
                )}
              >
                {approve.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />
                }
                อนุมัติ
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg',
                  'bg-red-600 text-white px-4 py-2.5 text-sm font-medium',
                  'hover:bg-red-700 disabled:opacity-60 transition-colors'
                )}
              >
                <XCircle className="w-4 h-4" />
                ไม่อนุมัติ
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="form-label text-gray-700">
                เหตุผลที่ไม่อนุมัติ <span className="text-red-500">*</span>
              </label>
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
                disabled={!reason.trim() || isLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                ยืนยันไม่อนุมัติ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
