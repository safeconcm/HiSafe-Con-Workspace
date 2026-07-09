'use client'
// src/app/(dashboard)/hr/work-schedule/page.tsx
// Lets HR/admin set this company's normal weekly working days (e.g.
// Highcon works Mon-Sat, Safecon works Mon-Fri) plus specific-date
// overrides for exceptions (e.g. "this particular Saturday IS a working
// day" for Safecon) — per the design discussed, overrides are always a
// specific date HR picks, not a computed alternating-week formula.
// See src/lib/work-schedule.ts for how these combine everywhere else in
// the app (timesheet PDF/Excel weekend shading today; more consumers can
// read the same two tables later).

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { formatDateTH, cn } from '@/utils'
import { CalendarClock, Plus, Trash2, Loader2 } from 'lucide-react'

const WEEKDAY_LABEL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

export default function WorkSchedulePage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ override_date: '', is_working_day: true, note: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['work-schedule'],
    queryFn: async () => {
      const res  = await fetch('/api/hr/work-schedule')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  const schedule: { weekday: number; is_working_day: boolean }[] = data?.schedule ?? []
  const overrides: { id: string; override_date: string; is_working_day: boolean; note: string | null }[] = data?.overrides ?? []
  const scheduleMap = new Map(schedule.map(s => [s.weekday, s.is_working_day]))

  const toggleWeekday = useMutation({
    mutationFn: async ({ weekday, is_working_day }: { weekday: number; is_working_day: boolean }) => {
      const res  = await fetch('/api/hr/work-schedule', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekday, is_working_day }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-schedule'] })
      toast.success('บันทึกแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  const addOverride = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/hr/work-schedule/overrides', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-schedule'] })
      toast.success('เพิ่มวันที่เจาะจงแล้ว')
      setForm({ override_date: '', is_working_day: true, note: '' })
    },
    onError: (e: Error) => toast.error('เพิ่มไม่สำเร็จ', e.message),
  })

  const removeOverride = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/work-schedule/overrides/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-schedule'] })
      toast.success('ลบแล้ว')
    },
    onError: (e: Error) => toast.error('ลบไม่สำเร็จ', e.message),
  })

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  )

  return (
    <div className="page-container max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-gray-500" />
        <h1>ตารางวันทำงาน</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-4">
        กำหนดวันทำงานปกติของบริษัทนี้ (เช่น ทำงานถึงเสาร์ หรือหยุดเสาร์-อาทิตย์) และเพิ่มวันที่เจาะจงที่ต่างจากปกติ —
        ใช้กำหนดวันหยุดสุดสัปดาห์ใน PDF/Excel ของ Timesheet
      </p>

      {/* Weekly pattern */}
      <div className="card card-body space-y-3">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">วันทำงานปกติรายสัปดาห์</h3>
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_LABEL.map((label, weekday) => {
            const isWorking = scheduleMap.get(weekday) ?? (weekday !== 0 && weekday !== 6)
            return (
              <button
                key={weekday}
                onClick={() => toggleWeekday.mutate({ weekday, is_working_day: !isWorking })}
                disabled={toggleWeekday.isPending}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition-colors disabled:opacity-60',
                  isWorking
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-gray-50 text-gray-400'
                )}
              >
                <span>{label}</span>
                <span className="text-[10px]">{isWorking ? 'ทำงาน' : 'หยุด'}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-400">คลิกที่วันเพื่อสลับสถานะทำงาน/หยุด</p>
      </div>

      {/* Specific-date overrides */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">วันที่เจาะจง (ต่างจากปกติ)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-3 items-end">
          <div>
            <label className="form-label">วันที่</label>
            <input type="date" value={form.override_date}
              onChange={e => setForm(f => ({ ...f, override_date: e.target.value }))}
              className="form-input" />
          </div>
          <div>
            <label className="form-label">สถานะ</label>
            <select value={form.is_working_day ? '1' : '0'}
              onChange={e => setForm(f => ({ ...f, is_working_day: e.target.value === '1' }))}
              className="form-input">
              <option value="1">วันทำงาน</option>
              <option value="0">วันหยุด</option>
            </select>
          </div>
          <div>
            <label className="form-label">หมายเหตุ</label>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="form-input" placeholder="เช่น เสาร์ทำงานชดเชย" />
          </div>
          <button
            onClick={() => addOverride.mutate(form)}
            disabled={!form.override_date || addOverride.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 h-[42px]"
          >
            <Plus className="w-4 h-4" />เพิ่ม
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {overrides.map(o => (
            <div key={o.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {formatDateTH(o.override_date)}
                  <span className={cn('ml-2 badge', o.is_working_day ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>
                    {o.is_working_day ? 'วันทำงาน' : 'วันหยุด'}
                  </span>
                </p>
                {o.note && <p className="text-xs text-gray-400">{o.note}</p>}
              </div>
              <button onClick={() => removeOverride.mutate(o.id)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {!overrides.length && (
            <p className="text-center text-sm text-gray-400 py-6">ยังไม่มีวันที่เจาะจง</p>
          )}
        </div>
      </div>
    </div>
  )
}
