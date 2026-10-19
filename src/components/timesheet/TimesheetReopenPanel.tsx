'use client'
// src/components/timesheet/TimesheetReopenPanel.tsx
// Lets HR/Admin, or specifically the supervisor who approved this Timesheet,
// reopen it back to 'draft' for a correction — see the /reopen route's own
// comment for the full reasoning. Added 2026-10-19.
import { useState } from 'react'
import { useReopenTimesheet } from '@/hooks/useTimesheet'
import { RotateCcw, Loader2 } from 'lucide-react'

interface Props {
  timesheetId:   string
  approvedById:  string | null
  currentUserId: string
  currentUserRole: string
  status:        string
  onDone?:       () => void
}

export function TimesheetReopenPanel({ timesheetId, approvedById, currentUserId, currentUserRole, status, onDone }: Props) {
  const [open, setOpen]     = useState(false)
  const [reason, setReason] = useState('')

  const reopen = useReopenTimesheet()

  const canReopen =
    (currentUserRole === 'hr' || currentUserRole === 'admin') ||
    (!!approvedById && approvedById === currentUserId)

  if (!canReopen || !['submitted', 'approved'].includes(status)) return null

  const handleReopen = async () => {
    if (!reason.trim()) return
    await reopen.mutateAsync({ id: timesheetId, reason })
    setOpen(false)
    setReason('')
    onDone?.()
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RotateCcw className="w-4 h-4" />
          เปิดให้แก้ไข
        </button>
      </div>
    )
  }

  return (
    <div className="card border-2 border-amber-200 bg-amber-50">
      <div className="card-header bg-amber-50 border-amber-100">
        <h3 className="text-sm font-medium text-amber-800">เปิดให้แก้ไข Timesheet นี้อีกครั้ง</h3>
      </div>
      <div className="card-body space-y-4">
        <p className="text-xs text-gray-500">
          Timesheet จะกลับไปเป็นสถานะร่าง พนักงานต้องแก้ไขแล้วส่งเข้าสู่ขั้นตอนอนุมัติใหม่ทั้งหมด
        </p>
        <div>
          <label className="form-label">เหตุผลที่เปิดให้แก้ไข <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="form-input resize-none"
            placeholder="เช่น ลาป่วยกะทันหันวันที่ 28 ข้อมูลที่กรอกล่วงหน้าไม่ตรง..."
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setOpen(false); setReason('') }}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleReopen}
            disabled={!reason.trim() || reopen.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
          >
            {reopen.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            ยืนยันเปิดให้แก้ไข
          </button>
        </div>
      </div>
    </div>
  )
}
