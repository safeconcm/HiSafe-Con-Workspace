'use client'
// src/app/(dashboard)/hr/holidays/page.tsx
import { useState }    from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDateTH } from '@/utils'
import { toast }        from '@/components/ui/Toaster'
import { Plus, Trash2, CalendarDays, Loader2 } from 'lucide-react'
import { cn }           from '@/utils'

type HolidayType = 'national' | 'company' | 'special'

const TYPE_LABEL: Record<HolidayType, string> = {
  national: 'วันหยุดราชการ',
  company:  'วันหยุดบริษัท',
  special:  'กรณีพิเศษ',
}
const TYPE_COLOR: Record<HolidayType, string> = {
  national: 'bg-red-100 text-red-700',
  company:  'bg-blue-100 text-blue-700',
  special:  'bg-purple-100 text-purple-700',
}

async function fetchHolidays(year: number) {
  const res  = await fetch(`/api/hr/holidays?year=${year}`)
  const json = await res.json()
  return json.data?.holidays ?? []
}

export default function HolidaysPage() {
  const [year, setYear]     = useState(new Date().getFullYear())
  const [showForm, setForm] = useState(false)
  const [form, setForm2]    = useState({ holiday_date: '', name_th: '', name_en: '', type: 'national' as HolidayType })

  const qc = useQueryClient()
  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', year],
    queryFn:  () => fetchHolidays(year),
  })

  const create = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/hr/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holidays', year] })
      toast.success('เพิ่มวันหยุดสำเร็จ')
      setForm(false)
      setForm2({ holiday_date: '', name_th: '', name_en: '', type: 'national' })
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/holidays/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holidays', year] })
      toast.success('ลบวันหยุดแล้ว')
    },
  })

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + i - 1)

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-gray-500" />
          <h1>วันหยุดประจำปี</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="form-input w-auto"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            <Plus className="w-4 h-4" />
            เพิ่มวันหยุด
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">เพิ่มวันหยุดใหม่</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">วันที่ *</label>
              <input
                type="date"
                value={form.holiday_date}
                onChange={e => setForm2(f => ({ ...f, holiday_date: e.target.value }))}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">ประเภท</label>
              <select
                value={form.type}
                onChange={e => setForm2(f => ({ ...f, type: e.target.value as HolidayType }))}
                className="form-input"
              >
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">ชื่อภาษาไทย *</label>
              <input
                type="text"
                value={form.name_th}
                onChange={e => setForm2(f => ({ ...f, name_th: e.target.value }))}
                className="form-input"
                placeholder="เช่น วันสงกรานต์"
              />
            </div>
            <div>
              <label className="form-label">ชื่อภาษาอังกฤษ</label>
              <input
                type="text"
                value={form.name_en}
                onChange={e => setForm2(f => ({ ...f, name_en: e.target.value }))}
                className="form-input"
                placeholder="e.g. Songkran Festival"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >ยกเลิก</button>
            <button
              onClick={() => create.mutate(form)}
              disabled={!form.holiday_date || !form.name_th || create.isPending}
              className="rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {create.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ชื่อวันหยุด</th>
                <th>ประเภท</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {(holidays as any[]).map((h: any) => (
                <tr key={h.id}>
                  <td className="text-sm text-gray-700 whitespace-nowrap">
                    {formatDateTH(h.holiday_date)}
                  </td>
                  <td>
                    <p className="text-sm font-medium text-gray-900">{h.name_th}</p>
                    {h.name_en && <p className="text-xs text-gray-400">{h.name_en}</p>}
                  </td>
                  <td>
                    <span className={cn('badge', TYPE_COLOR[h.type as HolidayType])}>
                      {TYPE_LABEL[h.type as HolidayType]}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => remove.mutate(h.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!holidays.length && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-400 py-8 text-sm">
                    ยังไม่มีวันหยุดสำหรับปี {year}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">รวม {holidays.length} วันหยุด ปี {year}</p>
    </div>
  )
}
