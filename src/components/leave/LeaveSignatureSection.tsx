'use client'
// src/components/leave/LeaveSignatureSection.tsx
// Read-only display of the two self-service e-signatures on a leave
// request: the requester's (auto-attached the moment they submitted) and
// the approver's (auto-attached the moment they clicked "อนุมัติ" — no
// separate signing step, and no distinct "HR" signer; whoever approved is
// whoever signs here). Each person sets up their own reusable signature
// once at Profile > ลายเซ็นดิจิทัลของฉัน.

import { CheckCircle2, PenLine } from 'lucide-react'
import { formatDateTime } from '@/utils'

interface SignatureSlot {
  label:       string
  name:        string | null
  signedUrl:   string | null
  signedAt:    string | null
  // Shown when there's no signature image yet — different wording for "no
  // one has acted yet" vs "acted, but they haven't set up a signature".
  emptyHint:   string
}

interface Props {
  status:              string
  employeeName:        string
  employeeSignedUrl:   string | null
  employeeSignedAt:    string | null
  approverName:        string | null
  approverSignedUrl:   string | null
  approverSignedAt:    string | null
}

export function LeaveSignatureSection({
  status,
  employeeName,
  employeeSignedUrl, employeeSignedAt,
  approverName,
  approverSignedUrl, approverSignedAt,
}: Props) {
  // Nothing to show before an approval decision even starts (still pending
  // with no employee signature either — most requests will have the
  // employee's signature the moment they're submitted, so this really only
  // hides the section for the rare case where the employee has no saved
  // signature at all yet).
  if (status === 'draft') return null

  const slots: SignatureSlot[] = [
    {
      label:     'ผู้ขอลา',
      name:      employeeName,
      signedUrl: employeeSignedUrl,
      signedAt:  employeeSignedAt,
      emptyHint: 'พนักงานยังไม่ได้ตั้งค่าลายเซ็น (โปรไฟล์ > ลายเซ็นดิจิทัลของฉัน)',
    },
    {
      label:     'ผู้อนุมัติ',
      name:      approverName,
      signedUrl: approverSignedUrl,
      signedAt:  approverSignedAt,
      emptyHint: status === 'pending'
        ? 'รอการอนุมัติ'
        : 'อนุมัติแล้ว แต่ผู้อนุมัติยังไม่ได้ตั้งค่าลายเซ็น',
    },
  ]

  return (
    <div className="card">
      <div className="card-header flex items-center gap-2">
        <PenLine className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-700">ลายเซ็นดิจิทัล (e-Signature)</h3>
      </div>
      <div className="card-body space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {slots.map(slot => (
            <div key={slot.label} className="border border-dashed border-gray-200 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-3 font-medium">{slot.label}</p>

              {slot.signedUrl ? (
                <div className="space-y-2">
                  <div className="h-16 flex items-center justify-center border-b border-gray-300 mx-4">
                    <img src={slot.signedUrl} alt={`ลายเซ็น${slot.label}`} className="max-h-14 max-w-full object-contain" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">{slot.name ?? '—'}</p>
                  {slot.signedAt && (
                    <p className="text-xs text-gray-400">{formatDateTime(slot.signedAt)}</p>
                  )}
                  <div className="flex items-center justify-center gap-1.5 text-green-700 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    เซ็นดิจิทัลแล้ว
                  </div>
                </div>
              ) : (
                <div className="py-6 text-xs text-gray-400">{slot.emptyHint}</div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          ลายเซ็นถูกดึงมาจากลายเซ็นที่บันทึกไว้ในโปรไฟล์ของแต่ละคนโดยอัตโนมัติ ไม่ต้องเซ็นซ้ำทุกครั้ง
        </p>
      </div>
    </div>
  )
}
