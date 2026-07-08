'use client'
// src/app/(dashboard)/hr/probation/[id]/page.tsx
// Detail page for one employee's probation: 3 evaluator slots
// (supervisor / department head / MD) + HR's final resolve action.

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { fullNameTH, cn } from '@/utils'
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'

const ROLE_LABEL: Record<string, string> = {
  supervisor: 'หัวหน้างาน',
  dept_head:  'หัวหน้าแผนก',
  md:         'MD (กรรมการผู้จัดการ)',
}
const RESULT_LABEL: Record<string, string> = { pass: 'ผ่าน', fail: 'ไม่ผ่าน', extend: 'ขอขยายเวลา' }

function EvaluatorSlot({ contractId, role, existing, onSaved }: {
  contractId: string; role: string; existing: any; onSaved: () => void
}) {
  const [result,   setResult]   = useState(existing?.result ?? '')
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [saving,   setSaving]   = useState(false)

  const save = async () => {
    if (!result) { toast.error('กรุณาเลือกผลการประเมิน'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/probation-evaluations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId, evaluator_role: role, result, comments }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ')
      toast.success('บันทึกผลประเมินแล้ว')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card card-body space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{ROLE_LABEL[role]}</h3>
        {existing && (
          <span className="text-xs text-gray-400">
            บันทึกล่าสุด {new Date(existing.evaluated_at).toLocaleDateString('th-TH')}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {(['pass', 'fail', 'extend'] as const).map(r => (
          <button key={r} type="button" onClick={() => setResult(r)}
            className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              result === r
                ? r === 'pass' ? 'bg-green-600 border-green-600 text-white'
                : r === 'fail' ? 'bg-red-600 border-red-600 text-white'
                : 'bg-amber-500 border-amber-500 text-white'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
            {RESULT_LABEL[r]}
          </button>
        ))}
      </div>
      <textarea value={comments} onChange={e => setComments(e.target.value)}
        rows={2} placeholder="ความเห็นเพิ่มเติม (ถ้ามี)" className="form-input" />
      <button onClick={save} disabled={saving}
        className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'บันทึก'}
      </button>
    </div>
  )
}

export default function ProbationDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const qc = useQueryClient()

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/contracts/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  const { data: evalData } = useQuery({
    queryKey: ['probation-evaluations', id],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/probation-evaluations?contract_id=${id}`)
      const json = await res.json()
      return json.data
    },
    enabled: !!id,
  })

  const evaluations = evalData?.evaluations ?? []
  const byRole = (role: string) => evaluations.find((e: any) => e.evaluator_role === role)

  const [resolving, setResolving] = useState(false)
  const [newSalary, setNewSalary] = useState('')

  const resolve = async (finalResult: 'passed' | 'failed' | 'extended') => {
    if (!confirm(`ยืนยันเปลี่ยนสถานะเป็น "${finalResult === 'passed' ? 'ผ่านทดลองงาน' : finalResult === 'failed' ? 'ไม่ผ่านทดลองงาน' : 'ขยายเวลาทดลองงาน'}"?`)) return
    setResolving(true)
    try {
      const res = await fetch(`/api/hr/contracts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          probation_status: finalResult,
          ...(finalResult === 'passed' && newSalary ? { base_salary: Number(newSalary) } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ')

      // If salary was raised on passing, log it in salary history too
      if (finalResult === 'passed' && newSalary && Number(newSalary) !== Number(contract.base_salary)) {
        await fetch('/api/hr/salary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: contract.user_id,
            effective_date: new Date().toISOString().split('T')[0],
            base_salary: Number(newSalary),
            reason: 'ปรับเงินเดือนหลังผ่านทดลองงาน',
          }),
        })
      }

      toast.success('บันทึกผลทดลองงานแล้ว')
      qc.invalidateQueries({ queryKey: ['contract', id] })
      router.push('/hr/probation')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setResolving(false)
    }
  }

  if (isLoading || !contract) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  const allSubmitted = ['supervisor', 'dept_head', 'md'].every(r => byRole(r))
  const allPass  = ['supervisor', 'dept_head', 'md'].every(r => byRole(r)?.result === 'pass')
  const anyFail  = ['supervisor', 'dept_head', 'md'].some(r => byRole(r)?.result === 'fail')

  return (
    <div className="page-container max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/hr/probation" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1>{fullNameTH(contract.user)}</h1>
          <p className="text-sm text-gray-500">{contract.position_th} · ครบกำหนด {contract.probation_end}</p>
        </div>
      </div>

      {contract.probation_status !== 'pending' && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          สรุปผลแล้ว: {contract.probation_status === 'passed' ? 'ผ่านทดลองงาน' : contract.probation_status === 'failed' ? 'ไม่ผ่านทดลองงาน' : 'ขยายเวลาทดลองงาน'}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-1">
        {['supervisor', 'dept_head', 'md'].map(role => (
          <EvaluatorSlot key={role} contractId={id} role={role} existing={byRole(role)}
            onSaved={() => qc.invalidateQueries({ queryKey: ['probation-evaluations', id] })} />
        ))}
      </div>

      {contract.probation_status === 'pending' && (
        <div className="card card-body space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">สรุปผลทดลองงาน (HR)</h3>
          {!allSubmitted && (
            <p className="text-xs text-amber-600">ยังมีผู้ประเมินที่ยังไม่บันทึกผล — สรุปผลได้เมื่อครบทั้ง 3 คน หรือ HR ยืนยันเองได้ถ้าจำเป็น</p>
          )}
          <div>
            <label className="form-label">ปรับเงินเดือนใหม่ (ถ้าผ่าน — เว้นว่างถ้าไม่ปรับ)</label>
            <input type="number" value={newSalary} onChange={e => setNewSalary(e.target.value)}
              placeholder={`ปัจจุบัน ${Number(contract.base_salary).toLocaleString('th-TH')} บาท`} className="form-input" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => resolve('passed')} disabled={resolving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-60">
              <CheckCircle2 className="w-4 h-4" />ผ่านทดลองงาน — บรรจุประจำ
            </button>
            <button onClick={() => resolve('failed')} disabled={resolving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-60">
              <XCircle className="w-4 h-4" />ไม่ผ่านทดลองงาน
            </button>
          </div>
          <button onClick={() => resolve('extended')} disabled={resolving}
            className="w-full rounded-lg border border-amber-400 text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50 disabled:opacity-60">
            ขยายเวลาทดลองงาน
          </button>
          {allPass && <p className="text-xs text-green-600">ผู้ประเมินทั้ง 3 คนให้ผล &quot;ผ่าน&quot; ตรงกัน</p>}
          {anyFail && <p className="text-xs text-red-600">มีผู้ประเมินอย่างน้อย 1 คนให้ผล &quot;ไม่ผ่าน&quot; — โปรดพิจารณาก่อนสรุป</p>}
        </div>
      )}
    </div>
  )
}
