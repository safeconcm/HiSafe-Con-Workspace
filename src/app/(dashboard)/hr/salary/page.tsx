'use client'
// src/app/(dashboard)/hr/salary/page.tsx
import { useState }    from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUsers }    from '@/hooks/useAdmin'
import { toast }       from '@/components/ui/Toaster'
import { fullNameTH, cn } from '@/utils'
import { DollarSign, Plus, Download, Loader2, TrendingUp, Printer } from 'lucide-react'

export default function SalaryPage() {
  const qc       = useQueryClient()
  const [userId, setUserId]   = useState('')
  const [page,   setPage]     = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    user_id: '', effective_date: '', base_salary: '',
    reason: '', net_salary: '', notes: '',
  })

  const { data: usersData } = useUsers({ status: 'active', limit: 200 })
  const users = usersData?.users ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['salary', userId, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: '30' })
      if (userId) qs.set('user_id', userId)
      const res = await fetch(`/api/hr/salary?${qs}`)
      return (await res.json()).data
    },
  })

  const records = data?.records ?? []
  const total   = data?.total   ?? 0

  const addRecord = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/hr/salary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          base_salary: parseFloat(body.base_salary),
          net_salary:  body.net_salary ? parseFloat(body.net_salary) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary'] })
      toast.success('บันทึกประวัติเงินเดือนแล้ว')
      setShowForm(false)
      setForm({ user_id: '', effective_date: '', base_salary: '', reason: '', net_salary: '', notes: '' })
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-gray-500" />
          <h1>ประวัติเงินเดือน</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Printer className="w-4 h-4" />พิมพ์
          </button>
          <button onClick={() => window.open('/api/export?type=salary&format=xlsx', '_blank')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />Export
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            <Plus className="w-4 h-4" />บันทึกเงินเดือน
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card card-body space-y-4 no-print">
          <h3 className="text-sm font-medium text-gray-700">บันทึกประวัติเงินเดือน / ปรับเงินเดือน</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">พนักงาน *</label>
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="form-input">
                <option value="">— เลือกพนักงาน —</option>
                {(users as any[]).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.employee_code} · {fullNameTH(u)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">วันที่มีผล *</label>
              <input type="date" value={form.effective_date}
                onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">เงินเดือนฐาน (บาท) *</label>
              <input type="number" value={form.base_salary} min={0} step={100}
                onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))}
                className="form-input" placeholder="25000" />
            </div>
            <div>
              <label className="form-label">เงินเดือนสุทธิ (บาท)</label>
              <input type="number" value={form.net_salary} min={0} step={100}
                onChange={e => setForm(f => ({ ...f, net_salary: e.target.value }))}
                className="form-input" placeholder="คำนวณอัตโนมัติ" />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">เหตุผล</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="form-input" placeholder="ปรับเงินเดือนประจำปี / เลื่อนขั้น / เริ่มงาน" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button
              onClick={() => addRecord.mutate(form)}
              disabled={!form.user_id || !form.effective_date || !form.base_salary || addRecord.isPending}
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
              {addRecord.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* Filter by user */}
      <div className="flex items-center gap-3 no-print">
        <select value={userId} onChange={e => { setUserId(e.target.value); setPage(1) }} className="form-input w-auto max-w-xs">
          <option value="">— ทุกพนักงาน —</option>
          {(users as any[]).map((u: any) => (
            <option key={u.id} value={u.id}>{u.employee_code} · {fullNameTH(u)}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400">{total} รายการ</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>วันที่มีผล</th>
                <th className="text-right">เงินเดือนฐาน</th>
                <th className="text-right">เงินสุทธิ</th>
                <th>เหตุผล</th>
                <th>อนุมัติโดย</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <p className="text-sm font-medium text-gray-900">{fullNameTH(r.user)}</p>
                    <p className="text-xs text-gray-400">{r.user?.employee_code} · {r.user?.department}</p>
                  </td>
                  <td className="text-sm text-gray-700 whitespace-nowrap">{r.effective_date}</td>
                  <td className="text-right text-sm font-semibold text-gray-900">
                    {Number(r.base_salary).toLocaleString('th-TH')} ฿
                  </td>
                  <td className="text-right text-sm text-gray-600">
                    {r.net_salary ? `${Number(r.net_salary).toLocaleString('th-TH')} ฿` : '—'}
                  </td>
                  <td className="text-sm text-gray-600 max-w-[180px] truncate">{r.reason ?? '—'}</td>
                  <td className="text-xs text-gray-400">
                    {r.approved_by ? `${r.approved_by.first_name_th} ${r.approved_by.last_name_th}` : '—'}
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">ไม่มีข้อมูลเงินเดือน</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
