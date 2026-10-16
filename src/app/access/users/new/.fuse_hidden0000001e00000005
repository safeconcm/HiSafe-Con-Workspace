'use client'
// src/app/(dashboard)/admin/users/new/page.tsx
import { useRouter }    from 'next/navigation'
import { useForm }      from 'react-hook-form'
import { zodResolver }  from '@hookform/resolvers/zod'
import { z }            from 'zod'
import { useCreateUser } from '@/hooks/useAdmin'
import { ROLE_LABEL }   from '@/utils'
import { ArrowLeft }    from 'lucide-react'
import Link             from 'next/link'

const schema = z.object({
  employee_code: z.string().min(1, 'กรุณากรอกรหัสพนักงาน'),
  email:         z.string().email('อีเมลไม่ถูกต้อง'),
  first_name_th: z.string().min(1, 'กรุณากรอกชื่อ'),
  last_name_th:  z.string().min(1, 'กรุณากรอกนามสกุล'),
  first_name_en: z.string().optional(),
  last_name_en:  z.string().optional(),
  position_th:   z.string().optional(),
  department:    z.string().optional(),
  role:          z.enum(['employee', 'supervisor', 'hr', 'admin']),
  hire_date:     z.string().min(1, 'กรุณาเลือกวันเริ่มงาน'),
  phone:         z.string().optional(),
  annual_leave_balance:   z.number().min(0).optional(),
  sick_leave_balance:     z.number().min(0).optional(),
  personal_leave_balance: z.number().min(0).optional(),
})

type FormValues = z.infer<typeof schema>

function FormField({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="form-label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function NewUserPage() {
  const router = useRouter()
  const create = useCreateUser()
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'employee' },
  })

  const onSubmit: import("react-hook-form").SubmitHandler<FormValues> = async (values) => {
    await create.mutateAsync(values)
    router.push('/admin/users')
  }

  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1>เพิ่มผู้ใช้ใหม่</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Basic info */}
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลพื้นฐาน</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="รหัสพนักงาน" error={errors.employee_code?.message} required>
              <input {...register('employee_code')} className="form-input" placeholder="SC-001" />
            </FormField>
            <FormField label="อีเมล" error={errors.email?.message} required>
              <input {...register('email')} type="email" className="form-input" placeholder="name@company.com" />
            </FormField>
            <FormField label="ชื่อ (ไทย)" error={errors.first_name_th?.message} required>
              <input {...register('first_name_th')} className="form-input" placeholder="สมชาย" />
            </FormField>
            <FormField label="นามสกุล (ไทย)" error={errors.last_name_th?.message} required>
              <input {...register('last_name_th')} className="form-input" placeholder="ใจดี" />
            </FormField>
            <FormField label="ชื่อ (อังกฤษ)" error={errors.first_name_en?.message}>
              <input {...register('first_name_en')} className="form-input" placeholder="Somchai" />
            </FormField>
            <FormField label="นามสกุล (อังกฤษ)" error={errors.last_name_en?.message}>
              <input {...register('last_name_en')} className="form-input" placeholder="Jaidee" />
            </FormField>
          </div>
        </div>

        {/* Work info */}
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลการทำงาน</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="แผนก">
              <input {...register('department')} className="form-input" placeholder="Engineering" />
            </FormField>
            <FormField label="ตำแหน่ง">
              <input {...register('position_th')} className="form-input" placeholder="วิศวกรโครงการ" />
            </FormField>
            <FormField label="Role" error={errors.role?.message} required>
              <select {...register('role')} className="form-input">
                {(Object.entries(ROLE_LABEL) as [string, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </FormField>
            <FormField label="วันเริ่มงาน" error={errors.hire_date?.message} required>
              <input {...register('hire_date')} type="date" className="form-input" />
            </FormField>
            <FormField label="เบอร์โทร">
              <input {...register('phone')} className="form-input" placeholder="081-234-5678" />
            </FormField>
          </div>
        </div>

        {/* Initial leave balances (migration) */}
        <div className="card card-body space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">วันลาเริ่มต้น (สำหรับย้ายข้อมูลเดิม)</h3>
            <p className="text-xs text-gray-400 mt-0.5">ถ้าไม่กรอก ระบบจะคำนวณจากนโยบายและอายุงานให้อัตโนมัติ</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="พักร้อน (วัน)">
              <input {...register('annual_leave_balance')} type="number" min={0} max={20} step={0.5} className="form-input" placeholder="0" />
            </FormField>
            <FormField label="ลาป่วย (วัน)">
              <input {...register('sick_leave_balance')} type="number" min={0} max={30} step={0.5} className="form-input" placeholder="30" />
            </FormField>
            <FormField label="ลากิจ (วัน)">
              <input {...register('personal_leave_balance')} type="number" min={0} max={10} step={0.5} className="form-input" placeholder="5" />
            </FormField>
          </div>
        </div>

        {create.isError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {(create.error as Error).message}
          </div>
        )}

        <div className="flex gap-3">
          <Link href="/admin/users" className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center">
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={create.isPending}
            className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {create.isPending ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}
          </button>
        </div>
      </form>
    </div>
  )
}
