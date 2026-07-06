'use client'
// src/app/(dashboard)/admin/users/[id]/page.tsx
import { useParams, useRouter } from 'next/navigation'
import { useUser, useUpdateUser } from '@/hooks/useAdmin'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import {
  ROLE_LABEL, LEAVE_TYPE_LABEL, formatDateTH, fullNameTH, cn
} from '@/utils'
import {
  ArrowLeft, Save, Loader2, User,
  CalendarDays, Building2, Phone, Mail
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import type { UserRole, UserStatus, LeaveType } from '@/types/database'

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'ทำงานอยู่', inactive: 'ระงับการใช้งาน', resigned: 'ลาออกแล้ว',
}

export default function UserDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const id      = params.id as string
  const qc      = useQueryClient()

  const { data, isLoading } = useUser(id)
  const update = useUpdateUser(id)

  const user     = data?.user
  const balances = data?.balances ?? []

  const [form, setForm] = useState({
    first_name_th: '', last_name_th: '',
    first_name_en: '', last_name_en: '',
    position_th: '', department: '',
    phone: '', role: 'employee', status: 'active', hire_date: '',
  })

  useEffect(() => {
    if (!user) return
    setForm({
      first_name_th: user.first_name_th ?? '',
      last_name_th:  user.last_name_th  ?? '',
      first_name_en: user.first_name_en ?? '',
      last_name_en:  user.last_name_en  ?? '',
      position_th:   user.position_th   ?? '',
      department:    user.department    ?? '',
      phone:         user.phone         ?? '',
      role:          user.role,
      status:        user.status,
      hire_date:     user.hire_date     ?? '',
    })
  }, [user])

  // Leave balance adjustment
  const [adjForm, setAdjForm] = useState({
    leave_type: 'annual', year: new Date().getFullYear(),
    adjusted_days: 0, reason: '',
  })

  const adjustBalance = useMutation({
    mutationFn: async (body: typeof adjForm) => {
      const res  = await fetch('/api/hr/leave/adjustment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: id, ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', id] })
      toast.success('ปรับยอดวันลาแล้ว')
      setAdjForm(f => ({ ...f, adjusted_days: 0, reason: '' }))
    },
    onError: (e: Error) => toast.error('ปรับยอดไม่สำเร็จ', e.message),
  })

  const handleSave = async () => {
    await update.mutateAsync(form)
  }

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  if (!user) return (
    <div className="page-container">
      <p className="text-gray-500">ไม่พบข้อมูลผู้ใช้</p>
    </div>
  )

  return (
    <div className="page-container max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold shrink-0">
            {user.first_name_th.charAt(0)}
          </div>
          <div>
            <h1 className="text-lg font-semibold">{fullNameTH(user)}</h1>
            <p className="text-sm text-gray-400">{user.employee_code} · {user.email}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
        >
          {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึก
        </button>
      </div>

      {/* Basic Info */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลพื้นฐาน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'ชื่อ (ไทย)', field: 'first_name_th' },
            { label: 'นามสกุล (ไทย)', field: 'last_name_th' },
            { label: 'ชื่อ (อังกฤษ)', field: 'first_name_en' },
            { label: 'นามสกุล (อังกฤษ)', field: 'last_name_en' },
          ].map(({ label, field }) => (
            <div key={field}>
              <label className="form-label">{label}</label>
              <input
                value={(form as any)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="form-input"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Work Info */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลการทำงาน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">แผนก</label>
            <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">ตำแหน่ง</label>
            <input value={form.position_th} onChange={e => setForm(f => ({ ...f, position_th: e.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">เบอร์โทร</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">วันเริ่มงาน</label>
            <input type="date" value={form.hire_date} onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="form-input">
              {(Object.entries(ROLE_LABEL) as [UserRole, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">สถานะ</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="form-input">
              {(Object.entries(STATUS_LABEL) as [UserStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Leave Balances */}
      <div className="card overflow-hidden">
        <div className="card-header flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700">ยอดวันลา ปี {new Date().getFullYear()}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ประเภทลา</th>
                <th className="text-center">Quota</th>
                <th className="text-center">สะสม</th>
                <th className="text-center">ปรับ</th>
                <th className="text-center">ใช้ไป</th>
                <th className="text-center">รออนุมัติ</th>
                <th className="text-center">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {(['annual','sick','personal','maternity','other'] as LeaveType[]).map(lt => {
                const b = (balances as any[]).find((x: any) => x.leave_type === lt)
                if (!b) return (
                  <tr key={lt}>
                    <td className="text-sm text-gray-600">{LEAVE_TYPE_LABEL[lt]}</td>
                    <td colSpan={6} className="text-center text-xs text-gray-400">—</td>
                  </tr>
                )
                const avail = Math.max(b.quota_days + b.carried_forward + b.adjusted_days - b.used_days - b.pending_days, 0)
                return (
                  <tr key={lt}>
                    <td className="text-sm font-medium text-gray-900">{LEAVE_TYPE_LABEL[lt]}</td>
                    <td className="text-center text-sm">{b.quota_days}</td>
                    <td className="text-center text-sm text-blue-600">{b.carried_forward}</td>
                    <td className={cn('text-center text-sm', b.adjusted_days > 0 ? 'text-green-600' : b.adjusted_days < 0 ? 'text-red-600' : 'text-gray-400')}>
                      {b.adjusted_days > 0 ? `+${b.adjusted_days}` : b.adjusted_days}
                    </td>
                    <td className="text-center text-sm text-gray-600">{b.used_days}</td>
                    <td className="text-center text-sm text-amber-600">{b.pending_days}</td>
                    <td className="text-center text-sm font-bold text-blue-700">{avail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Adjustment form */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
          <p className="text-xs font-medium text-gray-600">ปรับยอดวันลาด้วยตนเอง (Leave Adjustment)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="form-label">ประเภท</label>
              <select value={adjForm.leave_type} onChange={e => setAdjForm(f => ({ ...f, leave_type: e.target.value }))} className="form-input text-sm">
                {(['annual','sick','personal'] as LeaveType[]).map(lt => (
                  <option key={lt} value={lt}>{LEAVE_TYPE_LABEL[lt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">ปี</label>
              <input type="number" value={adjForm.year} onChange={e => setAdjForm(f => ({ ...f, year: parseInt(e.target.value) }))} className="form-input text-sm" />
            </div>
            <div>
              <label className="form-label">จำนวนวัน (+/-)</label>
              <input type="number" step={0.5} value={adjForm.adjusted_days}
                onChange={e => setAdjForm(f => ({ ...f, adjusted_days: parseFloat(e.target.value) }))}
                className="form-input text-sm" placeholder="+2 หรือ -1" />
            </div>
            <div>
              <label className="form-label">เหตุผล</label>
              <input value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
                className="form-input text-sm" placeholder="เช่น ปรับตามสัญญา" />
            </div>
          </div>
          <button
            onClick={() => adjustBalance.mutate(adjForm)}
            disabled={!adjForm.reason.trim() || adjustBalance.isPending}
            className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
          >
            {adjustBalance.isPending ? 'กำลังบันทึก...' : 'ปรับยอดวันลา'}
          </button>
        </div>
      </div>

      {/* Org node info */}
      {user.org_node && (
        <div className="card card-body">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            สายบังคับบัญชา
          </h3>
          <div className="text-sm space-y-1.5">
            <div className="flex gap-3">
              <span className="text-gray-400 w-28">ผู้บังคับบัญชา</span>
              <span className="text-gray-900">
                {(user.org_node as any)?.parent?.user
                  ? `${(user.org_node as any).parent.user.first_name_th} ${(user.org_node as any).parent.user.last_name_th}`
                  : 'ไม่มี (ระดับสูงสุด)'}
              </span>
            </div>
            {(user.org_node as any)?.acting_approver_id && (
              <div className="flex gap-3">
                <span className="text-gray-400 w-28">ผู้ทำหน้าที่แทน</span>
                <span className="text-amber-700">ตั้งค่าแล้ว</span>
              </div>
            )}
          </div>
          <Link href="/admin/organization" className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            แก้ไขใน Org Structure →
          </Link>
        </div>
      )}
    </div>
  )
}
