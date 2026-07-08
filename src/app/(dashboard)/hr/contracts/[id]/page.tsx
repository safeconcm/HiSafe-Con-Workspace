'use client'
// src/app/(dashboard)/hr/contracts/[id]/page.tsx
// Contract detail / edit page. The list page (/hr/contracts) already linked
// here but this page didn't exist yet — clicking a contract row 404'd.
// Uses the existing GET/PATCH /api/hr/contracts/[id] route (no API changes).

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { fullNameTH, cn } from '@/utils'
import { ArrowLeft, Save, Loader2, CheckCircle2, FileText, Wallet } from 'lucide-react'
import Link from 'next/link'

const CONTRACT_TYPES: Record<string, string> = {
  permanent: 'พนักงานประจำ (ไม่มีกำหนด)', fixed_term: 'สัญญาจ้าง (มีกำหนด)',
  part_time: 'พาร์ทไทม์', intern: 'ฝึกงาน', outsource: 'เอาท์ซอร์ส',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500', active: 'bg-green-100 text-green-700',
  expired: 'bg-amber-100 text-amber-700', terminated: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง', active: 'มีผล', expired: 'หมดอายุ', terminated: 'สิ้นสุด',
}
const PROBATION_LABEL: Record<string, string> = {
  pending: 'อยู่ระหว่างทดลองงาน', passed: 'ผ่านทดลองงาน', failed: 'ไม่ผ่านทดลองงาน', extended: 'ขยายเวลาทดลองงาน',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

export default function ContractDetailPage() {
  const params = useParams()
  const id     = params.id as string
  const router = useRouter()
  const qc     = useQueryClient()

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/contracts/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลไม่สำเร็จ')
      return json.data
    },
  })

  const [form, setForm] = useState({
    status: 'draft', position_th: '', position_en: '', department: '', work_location: '',
    base_salary: '', salary_type: 'monthly', overtime_rate: '1.5', notice_days: '30',
    end_date: '', notes: '', signed_by_employee: false, signed_by_hr: false,
  })

  useEffect(() => {
    if (!contract) return
    setForm({
      status:             contract.status ?? 'draft',
      position_th:        contract.position_th ?? '',
      position_en:        contract.position_en ?? '',
      department:         contract.department ?? '',
      work_location:      contract.work_location ?? '',
      base_salary:        String(contract.base_salary ?? ''),
      salary_type:        contract.salary_type ?? 'monthly',
      overtime_rate:      String(contract.overtime_rate ?? '1.5'),
      notice_days:        String(contract.notice_days ?? '30'),
      end_date:           contract.end_date ?? '',
      notes:              contract.notes ?? '',
      signed_by_employee: !!contract.signed_by_employee,
      signed_by_hr:       !!contract.signed_by_hr,
    })
  }, [contract])

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/hr/contracts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          base_salary:   parseFloat(form.base_salary) || 0,
          overtime_rate: parseFloat(form.overtime_rate) || 1.5,
          notice_days:   parseInt(form.notice_days) || 30,
          end_date:      form.end_date || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ')
      return json.data
    },
    onSuccess: () => {
      toast.success('บันทึกสัญญาแล้ว')
      qc.invalidateQueries({ queryKey: ['contract', id] })
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  )
  if (!contract) return (
    <div className="page-container"><p className="text-gray-500">ไม่พบสัญญานี้</p></div>
  )

  const willActivate = form.signed_by_employee && form.signed_by_hr && contract.status === 'draft'

  return (
    <div className="page-container max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/contracts" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">{fullNameTH(contract.user)}</h1>
          <p className="text-sm text-gray-400 font-mono">{contract.contract_no} · {contract.user?.employee_code}</p>
        </div>
        <span className={cn('badge', STATUS_COLOR[contract.status])}>{STATUS_LABEL[contract.status]}</span>
      </div>

      {contract.probation_status && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-blue-700">
            สถานะทดลองงาน: <strong>{PROBATION_LABEL[contract.probation_status] ?? contract.probation_status}</strong>
            {contract.probation_end && ` · ครบกำหนด ${contract.probation_end}`}
          </p>
          <Link href={`/hr/probation/${contract.id}`} className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">
            ไปหน้าประเมินทดลองงาน →
          </Link>
        </div>
      )}

      {/* Employee (read-only) */}
      <div className="card card-body space-y-1">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2 mb-2">ข้อมูลพนักงาน</h3>
        <p className="text-sm text-gray-600">{contract.user?.email} · {contract.user?.phone ?? '—'}</p>
        <p className="text-sm text-gray-600">ประเภทสัญญา: {CONTRACT_TYPES[contract.contract_type] ?? contract.contract_type} · เริ่มงาน {contract.start_date}</p>
      </div>

      {/* Editable terms */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">เงื่อนไขสัญญา</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ตำแหน่ง (ไทย)"><input value={form.position_th} onChange={set('position_th')} className="form-input" /></Field>
          <Field label="ตำแหน่ง (อังกฤษ)"><input value={form.position_en} onChange={set('position_en')} className="form-input" /></Field>
          <Field label="แผนก"><input value={form.department} onChange={set('department')} className="form-input" /></Field>
          <Field label="สถานที่ทำงาน"><input value={form.work_location} onChange={set('work_location')} className="form-input" /></Field>
          <Field label="วันสิ้นสุดสัญญา (ว่างหากถาวร)">
            <input type="date" value={form.end_date} onChange={set('end_date')} className="form-input" />
          </Field>
          <Field label="บอกล่วงหน้า (วัน)">
            <input type="number" value={form.notice_days} onChange={set('notice_days')} className="form-input" min={0} />
          </Field>
          <Field label="สถานะสัญญา">
            <select value={form.status} onChange={set('status')} className="form-input">
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Salary */}
      <div className="card card-body space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-medium text-gray-700">ค่าตอบแทน</h3>
          <Link href={`/hr/salary?user_id=${contract.user_id}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <Wallet className="w-3.5 h-3.5" />ดูประวัติเงินเดือน
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="เงินเดือนฐาน (บาท)">
            <input type="number" value={form.base_salary} onChange={set('base_salary')} className="form-input" min={0} step={100} />
          </Field>
          <Field label="รูปแบบ">
            <select value={form.salary_type} onChange={set('salary_type')} className="form-input">
              <option value="monthly">รายเดือน</option>
              <option value="daily">รายวัน</option>
              <option value="hourly">รายชั่วโมง</option>
            </select>
          </Field>
          <Field label="อัตราโอที (เท่า)">
            <input type="number" value={form.overtime_rate} onChange={set('overtime_rate')} className="form-input" step={0.5} min={1} />
          </Field>
        </div>
        <p className="text-xs text-gray-400">การแก้เงินเดือนตรงนี้จะเปลี่ยนค่าในสัญญาเท่านั้น ไม่บันทึกลงประวัติเงินเดือน — ถ้าต้องการเก็บประวัติการปรับ ใช้หน้า &quot;ดูประวัติเงินเดือน&quot; ด้านบน</p>
      </div>

      {/* Signatures */}
      <div className="card card-body space-y-3">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">การลงนาม</h3>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.signed_by_employee}
            onChange={e => setForm(f => ({ ...f, signed_by_employee: e.target.checked }))} />
          พนักงานลงนามแล้ว
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.signed_by_hr}
            onChange={e => setForm(f => ({ ...f, signed_by_hr: e.target.checked }))} />
          HR ลงนามแล้ว
        </label>
        {willActivate && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />เมื่อบันทึก สัญญาจะเปลี่ยนสถานะเป็น &quot;มีผล&quot; อัตโนมัติ (ลงนามครบทั้ง 2 ฝ่ายแล้ว)
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="card card-body">
        <Field label="หมายเหตุ / เงื่อนไขเพิ่มเติม">
          <textarea value={form.notes} onChange={set('notes')} rows={3} className="form-input resize-none" />
        </Field>
      </div>

      <div className="flex gap-3">
        <Link href="/hr/contracts" className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-center">
          กลับ
        </Link>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึก
        </button>
      </div>
    </div>
  )
}
