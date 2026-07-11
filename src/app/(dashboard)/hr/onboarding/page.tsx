'use client'
// src/app/(dashboard)/hr/onboarding/page.tsx
import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }     from '@/components/ui/Toaster'
import { cn, fullNameTH } from '@/utils'
import { UserPlus, Loader2, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'

interface ChecklistItem {
  key: string
  label: string
  category?: string
  done: boolean
}

const STATUS_COLOR: Record<string,string> = {
  in_progress: 'bg-amber-100 text-amber-800',
  completed:   'bg-green-100 text-green-700',
}
const STATUS_LABEL: Record<string,string> = {
  in_progress: 'กำลังดำเนินการ',
  completed:   'เสร็จสิ้น',
}

export default function OnboardingPage() {
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-checklists', status],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      const res  = await fetch(`/api/hr/onboarding?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  const checklists: any[] = data?.checklists ?? []

  const toggleItem = useMutation({
    mutationFn: async ({ id, key }: { id: string; key: string }) => {
      const res  = await fetch(`/api/hr/onboarding/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle_key: key }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-checklists'] }),
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const setChecklistStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'complete' | 'reopen' }) => {
      const res  = await fetch(`/api/hr/onboarding/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-checklists'] })
      toast.success('อัปเดตสถานะแล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-gray-500" />
        <h1>เช็คลิสต์ onboard พนักงานใหม่</h1>
      </div>

      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        {['', 'in_progress', 'completed'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('px-3 py-1.5 rounded-md text-sm transition-colors',
              status === s ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}>
            {s === '' ? 'ทั้งหมด' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !checklists.length ? (
        <div className="card p-10 text-center text-gray-400 text-sm">
          ไม่มีรายการ onboard (แสดงเฉพาะพนักงานที่เริ่มงานภายใน 90 วันล่าสุด)
        </div>
      ) : (
        <div className="space-y-4">
          {checklists.map((c) => {
            const items: ChecklistItem[] = c.items ?? []
            const doneCount = items.filter(i => i.done).length
            const isOpen = expanded === c.id
            const categories = Array.from(new Set(items.map(i => i.category ?? 'อื่นๆ')))

            return (
              <div key={c.id} className="card overflow-hidden">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold shrink-0">
                    {c.user?.first_name_th?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{fullNameTH(c.user)}</p>
                    <p className="text-xs text-gray-400">{c.user?.employee_code} · {c.user?.department} · เริ่มงาน {c.user?.hire_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{doneCount}/{items.length} ข้อ</p>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className={cn('badge', STATUS_COLOR[c.status])}>{STATUS_LABEL[c.status]}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {categories.map(cat => (
                      <div key={cat}>
                        <p className="text-xs font-medium text-gray-500 mb-2">{cat}</p>
                        <div className="space-y-1.5">
                          {items.filter(i => (i.category ?? 'อื่นๆ') === cat).map(item => (
                            <button
                              key={item.key}
                              onClick={() => toggleItem.mutate({ id: c.id, key: item.key })}
                              disabled={toggleItem.isPending}
                              className={cn(
                                'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition-colors',
                                item.done ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                              )}
                            >
                              {item.done
                                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                              <span className={item.done ? 'line-through decoration-green-400' : ''}>{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-3 pt-2">
                      {c.status === 'in_progress' ? (
                        <button
                          onClick={() => setChecklistStatus.mutate({ id: c.id, action: 'complete' })}
                          disabled={setChecklistStatus.isPending}
                          className="flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {doneCount < items.length ? `ทำเครื่องหมายเสร็จสิ้น (ยังเหลือ ${items.length - doneCount} ข้อ)` : 'ทำเครื่องหมายเสร็จสิ้น'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setChecklistStatus.mutate({ id: c.id, action: 'reopen' })}
                          disabled={setChecklistStatus.isPending}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          เปิดใหม่
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
