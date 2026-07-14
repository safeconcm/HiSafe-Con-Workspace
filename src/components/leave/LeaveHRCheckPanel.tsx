'use client'
// src/components/leave/LeaveHRCheckPanel.tsx
// HR's 2nd-step check/acknowledgment panel — shown to HR/Admin AFTER the
// supervisor has already approved a leave request, mirroring the paper
// form's separate "ผู้ตรวจสอบ" signature block. Added 2026-07-14.
import { useState }        from 'react'
import { useHRCheckLeave } from '@/hooks/useLeave'
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/utils'

interface Props {
  leaveId:      string
  status:       string
  hrCheckedAt:  string | null
  isHROrAdmin:  boolean
  onDone?:      () => void
}

// 2026-07-14 (part 2): added an "ไม่อนุมัติ" option alongside the original
// "รับทราบ" — per explicit user decision, this is recorded as a NOTE only
// (hr_decision + hr_check_comment). It never changes leave_requests.status,
// used_days, or payroll — the supervisor's approval already locked those in
// and reversing them was deliberately ruled out (see hr-check route).
export function LeaveHRCheckPanel({ leaveId, status, hrCheckedAt, isHROrAdmin, onDone }: Props) {
  const [comment, setComment]         = useState('')
  const [showReject, setShowReject]   = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const hrCheck = useHRCheckLeave()

  // Only show to HR/Admin, only once the supervisor has approved, and only
  // if it hasn't already been checked.
  if (!isHROrAdmin || status !== 'approved' || hrCheckedAt) return null

  const handleCheck = async () => {
    await hrCheck.mutateAsync({ id: leaveId, comment: comment || undefined, decision: 'approved' })
    onDone?.()
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    await hrCheck.mutateAsync({ id: leaveId, comment: rejectReason, decision: 'rejected' })
    setShowReject(false)
    onDone?.()
  }

  return (
    <div className="card border-2 border-blue-200 bg-blue-50">
      <div className="card-header bg-blue-50 border-blue-100">
        <h3 className="text-sm font-medium text-blue-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          รอ HR ตรวจสอบ
        </h3>
      </div>
      <div className="card-body space-y-4">
        <p className="text-sm text-gray-600">
          หัวหน้างานอนุมัติแล้ว — ตรวจสอบเพื่อบันทึกลงในใบลา (ช่อง "ผู้ตรวจสอบ")
          {' '}
          <span className="text-gray-400">
            (หมายเหตุ: "ไม่อนุมัติ" ที่นี่เป็นเพียงข้อสังเกต ไม่เปลี่ยนสถานะใบลาที่หัวหน้างานอนุมัติแล้ว)
          </span>
        </p>

        {!showReject ? (
          <>
            <div>
              <label className="form-label text-gray-600">หมายเหตุ (ถ้ามี)</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                className="form-input resize-none"
                placeholder="ระบุหมายเหตุ (ไม่บังคับ)"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCheck}
                disabled={hrCheck.isPending}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg',
                  'bg-blue-700 text-white px-4 py-2.5 text-sm font-medium',
                  'hover:bg-blue-800 disabled:opacity-60 transition-colors'
                )}
              >
                {hrCheck.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />
                }
                รับทราบ / ตรวจสอบแล้ว
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={hrCheck.isPending}
                className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50 disabled:opacity-60"
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
                เหตุผล / ข้อสังเกต <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
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
                disabled={!rejectReason.trim() || hrCheck.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
              >
                {hrCheck.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                ยืนยันไม่อนุมัติ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
