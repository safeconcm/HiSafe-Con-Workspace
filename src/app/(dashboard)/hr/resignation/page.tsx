'use client'
// src/app/(dashboard)/hr/resignation/page.tsx
import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }     from '@/components/ui/Toaster'
import { cn, fullNameTH } from '@/utils'
import { LogOut, Loader2, CheckCircle2, Clock } from 'lucide-react'

const STATUS_COLOR: Record<string,string> = {
  pending:'bg-amber-100 text-amber-800', acknowledged:'bg-blue-100 text-blue-700',
  approved:'bg-green-100 text-green-700', completed:'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<string,string> = {
  pending:'รอดำเนินการ', acknowledged:'รับทราบแล้ว',
  approved:'อนุมัติแล้ว', completed:'เสร็จสิ้น',
}

export default function ResignationPage() {
  const [status, setStatus] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['resignations', status],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: '50' })
      if (status) qs.set('status', status)
      const res  = await fetch(`/api/hr/resignation?${qs}`)
      const json = await res.json()
      return json.data
    },
  })

  const items = data?.resignations ?? []

  const action = useMutation({
    mutationFn: async ({ id, act }: { id: string; act: string }) => {
      const res  = await fetch(`/api/hr/resignation/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resignations'] })
      toast.success('อัปเดตสถานะแล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <LogOut className="w-5 h-5 text-gray-500" />
          <h1>จัดการการลาออก</h1>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        {['','pending','acknowledged','approved','completed'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('px-3 py-1.5 rounded-md text-sm transition-colors',
              status === s ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}>
            {s === '' ? 'ทั้งหมด' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !items.length ? (
        <div className="card p-10 text-center text-gray-400 text-sm">ไม่มีรายการลาออก</div>
      ) : (
        <div className="space-y-4">
          {items.map((r: any) => (
            <div key={r.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-semibold shrink-0">
                  {r.user?.first_name_th?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{fullNameTH(r.user)}</p>
                  <p className="text-xs text-gray-400">{r.user?.employee_code} · {r.user?.department} · เริ่มงาน {r.user?.hire_date}</p>
                </div>
                <span className={cn('badge', STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-b border-gray-100 bg-gray-50">
                <div><p className="text-xs text-gray-400 mb-0.5">วันที่แจ้ง</p><p className="font-medium">{r.resign_date}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">วันสุดท้าย</p><p className="font-medium text-red-600">{r.last_work_date}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">ระยะเวลา</p>
                  <p className="font-medium">{Math.ceil((new Date(r.last_work_date).getTime() - new Date(r.resign_date).getTime()) / 86400000)} วัน</p>
                </div>
                <div><p className="text-xs text-gray-400 mb-0.5">สาเหตุ</p><p className="text-gray-700 truncate">{r.reason_category ?? '—'}</p></div>
              </div>
              {r.reason && (
                <div className="px-5 py-2.5 text-sm text-gray-600 border-b border-gray-100">{r.reason}</div>
              )}
              <div className="px-5 py-3 flex items-center gap-2">
                {r.status === 'pending' && (
                  <button onClick={() => action.mutate({ id: r.id, act: 'acknowledge' })}
                    disabled={action.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                    <Clock className="w-4 h-4" />รับทราบ
                  </button>
                )}
                {r.status === 'acknowledged' && (
                  <button onClick={() => action.mutate({ id: r.id, act: 'approve' })}
                    disabled={action.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-60">
                    <CheckCircle2 className="w-4 h-4" />อนุมัติ
                  </button>
                )}
                {r.status === 'approved' && (
                  <button onClick={() => action.mutate({ id: r.id, act: 'complete' })}
                    disabled={action.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-gray-700 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60">
                    <CheckCircle2 className="w-4 h-4" />เสร็จสิ้น + ออกใบรับรอง
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
