'use client'
// src/app/(dashboard)/hr/certificates/page.tsx
import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }     from '@/components/ui/Toaster'
import { cn, fullNameTH } from '@/utils'
import { Award, Plus, Download, Loader2, Printer } from 'lucide-react'
import { useUsers }  from '@/hooks/useAdmin'

const CERT_TYPE_LABEL: Record<string,string> = {
  employment:'รับรองการทำงาน', salary:'รับรองเงินเดือน',
  work_experience:'รับรองประสบการณ์', other:'อื่นๆ',
}

export default function CertificatesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    user_id: '', cert_type: 'employment', purpose: '', include_salary: false,
  })

  const { data: usersData } = useUsers({ status: 'active', limit: 200 })
  const users = usersData?.users ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['certificates'],
    queryFn: async () => {
      const res = await fetch('/api/hr/certificates?limit=50')
      return (await res.json()).data
    },
  })

  const certs = data?.certificates ?? []

  const issueCert = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/hr/certificates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      toast.success(`ออกใบรับรอง ${data.cert_no} แล้ว`)
      setShowForm(false)
      setForm({ user_id: '', cert_type: 'employment', purpose: '', include_salary: false })
    },
    onError: (e: Error) => toast.error('ออกใบรับรองไม่สำเร็จ', e.message),
  })

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-gray-500" />
          <h1>ใบรับรองการทำงาน</h1>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
          <Plus className="w-4 h-4" />ออกใบรับรองใหม่
        </button>
      </div>

      {/* Issue form */}
      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">ออกใบรับรองการทำงาน</h3>
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
              <label className="form-label">ประเภทใบรับรอง</label>
              <select value={form.cert_type} onChange={e => setForm(f => ({ ...f, cert_type: e.target.value }))} className="form-input">
                {Object.entries(CERT_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">วัตถุประสงค์</label>
              <input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                className="form-input" placeholder="เพื่อประกอบการสมัครสินเชื่อ / ทำวีซ่า / สมัครงาน" />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.include_salary}
                  onChange={e => setForm(f => ({ ...f, include_salary: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700">ระบุเงินเดือนในใบรับรอง</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button onClick={() => issueCert.mutate(form)}
              disabled={!form.user_id || issueCert.isPending}
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
              {issueCert.isPending ? 'กำลังออก...' : 'ออกใบรับรอง'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>พนักงาน</th>
                <th>ประเภท</th>
                <th>วัตถุประสงค์</th>
                <th>วันที่ออก</th>
                <th>เงินเดือน</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c: any) => (
                <tr key={c.id} className={c.is_voided ? 'opacity-40' : ''}>
                  <td className="font-mono text-xs text-gray-600">{c.cert_no}</td>
                  <td>
                    <p className="text-sm font-medium text-gray-900">{fullNameTH(c.user)}</p>
                    <p className="text-xs text-gray-400">{c.user?.employee_code}</p>
                  </td>
                  <td><span className="text-sm text-gray-700">{CERT_TYPE_LABEL[c.cert_type] ?? c.cert_type}</span></td>
                  <td className="text-sm text-gray-600 max-w-[200px] truncate">{c.purpose ?? '—'}</td>
                  <td className="text-sm text-gray-600 whitespace-nowrap">{c.issued_date}</td>
                  <td className="text-sm text-gray-600">
                    {c.include_salary && c.salary_amount
                      ? `${Number(c.salary_amount).toLocaleString('th-TH')} ฿`
                      : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => window.open(`/api/pdf/certificate/${c.id}`, '_blank')}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                      title="พิมพ์ใบรับรอง"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!certs.length && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">ยังไม่มีใบรับรอง</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
