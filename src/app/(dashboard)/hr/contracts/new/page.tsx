'use client'
// src/app/(dashboard)/hr/contracts/new/page.tsx
import { useState }   from 'react'
import { useRouter }  from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { useUsers }   from '@/hooks/useAdmin'
import { toast }      from '@/components/ui/Toaster'
import { fullNameTH } from '@/utils'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link           from 'next/link'

const CONTRACT_TYPES = [
  { value: 'permanent',  label: 'พนักงานประจำ (ไม่มีกำหนด)' },
  { value: 'fixed_term', label: 'สัญญาจ้าง (มีกำหนด)' },
  { value: 'part_time',  label: 'พาร์ทไทม์' },
  { value: 'intern',     label: 'ฝึกงาน' },
  { value: 'outsource',  label: 'เอาท์ซอร์ส' },
]

function Field({ label, required, children, error }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string
}) {
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

export default function NewContractPage() {
  const router = useRouter()
  const { data: usersData } = useUsers({ status: 'active', limit: 200 })
  const users = usersData?.users ?? []

  const [form, setForm] = useState({
    user_id:       '',
    contract_type: 'permanent',
    start_date:    '',
    end_date:      '',
    position_th:   '',
    position_en:   '',
    department:    '',
    work_location: '',
    base_salary:   '',
    salary_type:   'monthly',
    probation_days:'120',
    notice_days:   '30',
    overtime_rate: '1.5',
    notes:         '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/hr/contracts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...body,
          base_salary:    parseFloat(body.base_salary),
          probation_days: parseInt(body.probation_days),
          notice_days:    parseInt(body.notice_days),
          overtime_rate:  parseFloat(body.overtime_rate),
          end_date:       body.end_date || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      toast.success(`สร้างสัญญา ${data.contract_no} แล้ว`)
      router.push('/hr/contracts')
    },
    onError: (e: Error) => toast.error('ไม่สามารถสร้างสัญญา', e.message),
  })

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.user_id)    errs.user_id    = 'กรุณาเลือกพนักงาน'
    if (!form.start_date) errs.start_date = 'กรุณาระบุวันเริ่มงาน'
    if (!form.base_salary || parseFloat(form.base_salary) <= 0)
      errs.base_salary = 'กรุณาระบุเงินเดือน'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    create.mutate(form)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="page-container max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/contracts" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1>สร้างสัญญาจ้างใหม่</h1>
      </div>

      {/* Employee selection */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลพนักงาน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="พนักงาน" required error={errors.user_id}>
            <select value={form.user_id} onChange={set('user_id')} className="form-input">
              <option value="">— เลือกพนักงาน —</option>
              {(users as any[]).map((u: any) => (
                <option key={u.id} value={u.id}>{u.employee_code} · {fullNameTH(u)}</option>
              ))}
            </select>
          </Field>
          <Field label="ประเภทสัญญา">
            <select value={form.contract_type} onChange={set('contract_type')} className="form-input">
              {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Contract terms */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">เงื่อนไขสัญญา</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="วันเริ่มงาน" required error={errors.start_date}>
            <input type="date" value={form.start_date} onChange={set('start_date')} className="form-input" />
          </Field>
          <Field label="วันสิ้นสุดสัญญา (ว่างหากถาวร)">
            <input type="date" value={form.end_date} onChange={set('end_date')} className="form-input"
              min={form.start_date} />
          </Field>
          <Field label="ตำแหน่ง (ไทย)">
            <input value={form.position_th} onChange={set('position_th')} className="form-input" placeholder="วิศวกรโครงการ" />
          </Field>
          <Field label="ตำแหน่ง (อังกฤษ)">
            <input value={form.position_en} onChange={set('position_en')} className="form-input" placeholder="Project Engineer" />
          </Field>
          <Field label="แผนก">
            <input value={form.department} onChange={set('department')} className="form-input" placeholder="Engineering" />
          </Field>
          <Field label="สถานที่ทำงาน">
            <input value={form.work_location} onChange={set('work_location')} className="form-input" placeholder="สำนักงานใหญ่" />
          </Field>
          <Field label="ทดลองงาน (วัน)">
            <input type="number" value={form.probation_days} onChange={set('probation_days')} className="form-input" min={0} />
          </Field>
          <Field label="บอกล่วงหน้า (วัน)">
            <input type="number" value={form.notice_days} onChange={set('notice_days')} className="form-input" min={0} />
          </Field>
        </div>
      </div>

      {/* Salary */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ค่าตอบแทน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="เงินเดือนฐาน (บาท)" required error={errors.base_salary}>
            <input type="number" value={form.base_salary} onChange={set('base_salary')}
              className="form-input" placeholder="25000" min={0} step={100} />
          </Field>
          <Field label="รูปแบบ">
            <select value={form.salary_type} onChange={set('salary_type')} className="form-input">
              <option value="monthly">รายเดือน</option>
              <option value="daily">รายวัน</option>
              <option value="hourly">รายชั่วโมง</option>
            </select>
          </Field>
          <Field label="อัตราโอที (เท่า)">
            <input type="number" value={form.overtime_rate} onChange={set('overtime_rate')}
              className="form-input" step={0.5} min={1} />
          </Field>
        </div>
      </div>

      {/* Notes */}
      <div className="card card-body">
        <Field label="หมายเหตุ / เงื่อนไขเพิ่มเติม">
          <textarea value={form.notes} onChange={set('notes')} rows={3}
            className="form-input resize-none" placeholder="เงื่อนไขพิเศษ, สิทธิประโยชน์เพิ่มเติม..." />
        </Field>
      </div>

      <div className="flex gap-3">
        <Link href="/hr/contracts"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-center">
          ยกเลิก
        </Link>
        <button onClick={handleSubmit} disabled={create.isPending}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          สร้างสัญญา
        </button>
      </div>
    </div>
  )
}
