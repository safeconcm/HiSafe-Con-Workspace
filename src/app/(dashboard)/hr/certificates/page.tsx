'use client'
// src/app/(dashboard)/hr/certificates/page.tsx
import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }     from '@/components/ui/Toaster'
import { cn, fullNameTH } from '@/utils'
import { Award, Plus, Download, Loader2, Printer, Ban, RotateCcw } from 'lucide-react'
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

  // Void / reissue — see src/app/api/hr/certificates/[id]/route.ts and
  // .../reissue/route.ts. Voiding needs a reason, so it's a small inline
  // expanding row (this codebase has no modal/dialog component yet) rather
  // than a plain window.prompt. Reissue is a single click: it always copies
  // the original's type/purpose/salary-opt-in as-is, so there's nothing to
  // fill in — if different content is needed, issuing a brand new
  // certificate via the form above is the right tool for that.
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const voidCert = useMutation({
    mutationFn: async (id: string) => {
      const res  = await fetch(`/api/hr/certificates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', reason: voidReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      toast.success('ยกเลิกใบรับรองแล้ว')
      setVoidingId(null)
      setVoidReason('')
    },
    onError: (e: Error) => toast.error('ยกเลิกไม่สำเร็จ', e.message),
  })

  const reissueCert = useMutation({
    mutationFn: async (id: string) => {
      const res  = await fetch(`/api/hr/certificates/${id}/reissue`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      toast.success(`ออกใบรับรองใหม่ ${data.cert_no} แล้ว (แทนที่ฉบับเดิม)`)
    },
    onError: (e: Error) => toast.error('ออกใหม่ไม่สำเร็จ', e.message),
  })

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
                <Fragment key={c.id}>
                  <tr className={c.is_voided ? 'opacity-40' : ''}>
                    <td className="font-mono text-xs text-gray-600">
                      {c.cert_no}
                      {c.is_voided && (
                        <span className="ml-1.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 align-middle">ยกเลิกแล้ว</span>
                      )}
                      {c.superseded_by_id && (
                        <p className="mt-0.5 text-[10px] font-normal text-blue-600 normal-case">มีฉบับใหม่แทนที่แล้ว</p>
                      )}
                    </td>
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
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => window.open(`/api/pdf/certificate/${c.id}`, '_blank')}
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                          title="พิมพ์ใบรับรอง"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {!c.is_voided && (
                          <button
                            onClick={() => { setVoidingId(voidingId === c.id ? null : c.id); setVoidReason('') }}
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                            title="ยกเลิกใบรับรอง"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => reissueCert.mutate(c.id)}
                          disabled={reissueCert.isPending}
                          className="p-1.5 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-40"
                          title="ออกใบรับรองใหม่แทนที่ฉบับนี้"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {voidingId === c.id && (
                    <tr>
                      <td colSpan={7} className="bg-red-50 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={voidReason}
                            onChange={e => setVoidReason(e.target.value)}
                            placeholder="เหตุผลที่ยกเลิก (เช่น ข้อมูลผิด, ออกซ้ำ)"
                            className="form-input flex-1 text-sm"
                          />
                          <button
                            onClick={() => voidCert.mutate(c.id)}
                            disabled={!voidReason.trim() || voidCert.isPending}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {voidCert.isPending ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
                          </button>
                          <button
                            onClick={() => setVoidingId(null)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                          >
                            ปิด
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
