'use client'
// src/components/leave/LeaveHRCheckPanel.tsx
// HR's 2nd-step check/acknowledgment panel — shown to HR/Admin AFTER the
// supervisor has already approved a leave request, mirroring the paper
// form's separate "ผู้ตรวจสอบ" signature block. Added 2026-07-14.
import { useState }        from 'react'
import { useHRCheckLeave } from '@/hooks/useLeave'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/utils'

interface Props {
  leaveId:      string
  status:       string
  hrCheckedAt:  string | null
  isHROrAdmin:  boolean
  onDone?:      () => void
}

export function LeaveHRCheckPanel({ leaveId, status, hrCheckedAt, isHROrAdmin, onDone }: Props) {
  const [comment, setComment] = useState('')
  const hrCheck = useHRCheckLeave()

  // Only show to HR/Admin, only once the supervisor has approved, and only
  // if it hasn't already been checked.
  if (!isHROrAdmin || status !== 'approved' || hrCheckedAt) return null

  const handleCheck = async () => {
    await hrCheck.mutateAsync({ id: leaveId, comment: comment || undefined })
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
          หัวหน้างานอนุมัติแล้ว — ตรวจสอบและรับทราบเพื่อบันทึกลงในใบลา (ช่อง "ผู้ตรวจสอบ")
        </p>
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
        <button
          onClick={handleCheck}
          disabled={hrCheck.isPending}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-lg',
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
      </div>
    </div>
  )
}
