'use client'
// src/components/leave/LeaveSignatureSection.tsx
// Embeds e-Signature canvas into leave detail page
// Shows after leave is approved; allows employee + HR to sign

import { useState }            from 'react'
import { SignatureCanvas }     from '@/components/signature/SignatureCanvas'
import { useMutation }         from '@tanstack/react-query'
import { toast }               from '@/components/ui/Toaster'
import { PenLine, CheckCircle2, Loader2 } from 'lucide-react'
import { cn }                  from '@/utils'

interface Props {
  leaveId:       string
  status:        string
  currentUserId: string
  ownerId:       string
}

async function saveSignature(entityId: string, dataUrl: string, role: string) {
  const res  = await fetch('/api/signature', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      data_url:    dataUrl,
      entity_type: 'leave_request',
      entity_id:   entityId,
      role,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export function LeaveSignatureSection({ leaveId, status, currentUserId, ownerId }: Props) {
  const [showCanvas, setShowCanvas] = useState<string | null>(null)
  const [signed,     setSigned]     = useState<Record<string, boolean>>({})

  const save = useMutation({
    mutationFn: ({ dataUrl, role }: { dataUrl: string; role: string }) =>
      saveSignature(leaveId, dataUrl, role),
    onSuccess: (_, { role }) => {
      setSigned(s => ({ ...s, [role]: true }))
      setShowCanvas(null)
      toast.success('บันทึกลายเซ็นแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  // Only show for approved leaves
  if (status !== 'approved') return null

  const isOwner  = currentUserId === ownerId
  const sigSlots = [
    { role: 'employee', label: 'ลายเซ็นพนักงาน',    canSign: isOwner  },
    { role: 'hr',       label: 'ลายเซ็น HR',          canSign: !isOwner },
  ]

  return (
    <div className="card">
      <div className="card-header flex items-center gap-2">
        <PenLine className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-700">ลายเซ็นดิจิทัล (e-Signature)</h3>
      </div>
      <div className="card-body space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sigSlots.map(slot => (
            <div key={slot.role} className="border border-dashed border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-3 font-medium">{slot.label}</p>

              {signed[slot.role] ? (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">ลงลายเซ็นแล้ว</span>
                </div>
              ) : showCanvas === slot.role ? (
                <SignatureCanvas
                  label=""
                  height={120}
                  onSave={dataUrl => save.mutate({ dataUrl, role: slot.role })}
                  onCancel={() => setShowCanvas(null)}
                />
              ) : (
                <button
                  onClick={() => slot.canSign && setShowCanvas(slot.role)}
                  disabled={!slot.canSign || save.isPending}
                  className={cn(
                    'w-full rounded-lg border py-8 text-sm transition-colors',
                    slot.canSign
                      ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer'
                      : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  )}
                >
                  {slot.canSign ? (
                    <><PenLine className="w-4 h-4 mx-auto mb-1" />คลิกเพื่อลงลายเซ็น</>
                  ) : (
                    'รอลายเซ็น...'
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          ลายเซ็นดิจิทัลบันทึกลงระบบพร้อม timestamp — ใช้แทนลายเซ็นกระดาษได้
        </p>
      </div>
    </div>
  )
}
