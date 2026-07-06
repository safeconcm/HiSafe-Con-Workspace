'use client'
// src/app/(dashboard)/hr/leave-policies/page.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LEAVE_TYPE_LABEL, cn } from '@/utils'
import { toast } from '@/components/ui/Toaster'
import { Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import type { LeaveType } from '@/types/database'

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'personal', 'maternity', 'other']

async function fetchPolicies(year: number) {
  const res  = await fetch(`/api/hr/leave-policies?year=${year}`)
  const json = await res.json()
  return json.data?.policies ?? []
}

async function updatePolicy(id: string, data: any) {
  const res  = await fetch(`/api/hr/leave-policies/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export default function LeavePoliciesPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [edits, setEdits] = useState<Record<string, any>>({})
  const qc = useQueryClient()

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['leave-policies', year],
    queryFn: () => fetchPolicies(year),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updatePolicy(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-policies', year] })
      setEdits({})
      toast.success('บันทึกนโยบายการลาแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  const getEdit = (id: string, field: string, defaultVal: any) =>
    edits[id]?.[field] !== undefined ? edits[id][field] : defaultVal

  const setEdit = (id: string, field: string, value: any) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }))

  const handleSave = (policy: any) => {
    if (!edits[policy.id]) return
    update.mutate({ id: policy.id, data: edits[policy.id] })
  }

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() + i - 1)

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1>นโยบายการลา</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="form-input w-auto">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="card card-body">
        <p className="text-sm text-gray-500 mb-1">
          <span className="font-medium text-blue-700">พักร้อน (Annual):</span> Quota คำนวณจากอายุงาน — ปีที่ 1 = 6 วัน, เพิ่มปีละ 1 วัน สูงสุด 10 วัน
        </p>
        <p className="text-xs text-gray-400">สำหรับประเภทอื่น HR สามารถกำหนด Quota ได้ที่ตารางด้านล่าง</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>ประเภทลา</th>
                <th className="text-center">Quota (วัน/ปี)</th>
                <th className="text-center">สะสมได้สูงสุด</th>
                <th className="text-center">ลาครึ่งวัน</th>
                <th className="text-center">ต้องการเอกสาร (หลังจาก N วัน)</th>
                <th className="text-center">แจ้งล่วงหน้า (วัน)</th>
                <th className="w-16 text-center">บันทึก</th>
              </tr>
            </thead>
            <tbody>
              {LEAVE_TYPES.map(lt => {
                const policy = (policies as any[]).find((p: any) => p.leave_type === lt)
                if (!policy) return (
                  <tr key={lt}>
                    <td><span className="text-sm text-gray-500">{LEAVE_TYPE_LABEL[lt]}</span></td>
                    <td colSpan={6} className="text-center text-xs text-gray-400">ยังไม่มีนโยบายสำหรับปีนี้</td>
                  </tr>
                )

                const isDirty = !!edits[policy.id]
                const isAnnual = lt === 'annual'

                return (
                  <tr key={lt}>
                    <td>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{LEAVE_TYPE_LABEL[lt]}</p>
                        {policy.description_th && (
                          <p className="text-xs text-gray-400 mt-0.5">{policy.description_th}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      {isAnnual ? (
                        <span className="text-xs text-gray-400 italic">คำนวณอัตโนมัติ</span>
                      ) : (
                        <input
                          type="number" min={0} max={365} step={0.5}
                          value={getEdit(policy.id, 'quota_days', policy.quota_days)}
                          onChange={e => setEdit(policy.id, 'quota_days', parseFloat(e.target.value))}
                          className="w-20 text-center form-input text-sm"
                        />
                      )}
                    </td>
                    <td className="text-center">
                      <input
                        type="number" min={0} max={60} step={0.5}
                        value={getEdit(policy.id, 'carry_forward_max', policy.carry_forward_max)}
                        onChange={e => setEdit(policy.id, 'carry_forward_max', parseFloat(e.target.value))}
                        className="w-20 text-center form-input text-sm"
                        disabled={!isAnnual}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={getEdit(policy.id, 'allow_half_day', policy.allow_half_day)}
                        onChange={e => setEdit(policy.id, 'allow_half_day', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="number" min={0} max={30}
                        value={getEdit(policy.id, 'require_document_after_days', policy.require_document_after_days)}
                        onChange={e => setEdit(policy.id, 'require_document_after_days', parseInt(e.target.value))}
                        className="w-16 text-center form-input text-sm"
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="number" min={0} max={30}
                        value={getEdit(policy.id, 'min_days_notice', policy.min_days_notice)}
                        onChange={e => setEdit(policy.id, 'min_days_notice', parseInt(e.target.value))}
                        className="w-16 text-center form-input text-sm"
                      />
                    </td>
                    <td className="text-center">
                      {isDirty && (
                        <button
                          onClick={() => handleSave(policy)}
                          disabled={update.isPending}
                          className="p-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60"
                        >
                          {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
