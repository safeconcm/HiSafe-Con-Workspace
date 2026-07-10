'use client'
// src/app/(dashboard)/approvals/ot/page.tsx  — doubles as OT list for all roles
// /ot → redirected here; supervisor sees pending; employee sees own

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }          from '@/components/ui/Toaster'
import { cn, formatDateTH } from '@/utils'
import {
  Clock, Plus, CheckCircle2, XCircle, Loader2,
  ChevronRight, AlertCircle,
} from 'lucide-react'

const OT_TYPE_LABEL: Record<string, string> = {
  weekday: 'วันธรรมดา',
  weekend: 'วันหยุดสุดสัปดาห์',
  holiday: 'วันหยุดนักขัตฤกษ์',
}
const OT_TYPE_COLOR: Record<string, string> = {
  weekday: 'bg-blue-50 text-blue-700',
  weekend: 'bg-amber-50 text-amber-700',
  holiday: 'bg-red-50 text-red-700',
}
const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  pending:   'bg-amber-100 text-amber-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง', pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก',
}

function useCurrentUser() {
  if (typeof window === 'undefined') return { id: '', role: '' }
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('hsc_session='))
    if (!raw) return { id: '', role: '' }
    const s = JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))
    return { id: s.id, role: s.role }
  } catch { return { id: '', role: '' } }
}

async function fetchOT(status?: string, ownOnly?: boolean) {
  const params = new URLSearchParams({ limit: '50' })
  if (status)  params.set('status', status)
  if (ownOnly) params.set('own_only', '1')
  const res  = await fetch(`/api/ot?${params}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

async function fetchJobs() {
  const res  = await fetch(`/api/admin/jobs?year=${new Date().getFullYear()}`)
  const json = await res.json()
  return json.data?.jobs ?? []
}

export default function OTPage() {
  const { id: userId, role } = useCurrentUser()
  const qc = useQueryClient()
  const isSupervisor = ['supervisor','hr','admin'].includes(role)

  const [tab,       setTab]       = useState<'my'|'pending'>(isSupervisor ? 'pending' : 'my')
  const [showForm,  setShowForm]  = useState(false)
  const [rejectId,  setRejectId]  = useState<string|null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [form, setForm] = useState({
    ot_date: '', start_time: '18:00', end_time: '20:00', job_id: '', reason: '',
  })

  const { data: myData,      isLoading: l1 } = useQuery({ queryKey: ['ot-my'],      queryFn: () => fetchOT(undefined, true) })
  const { data: pendingData, isLoading: l2 } = useQuery({ queryKey: ['ot-pending'], queryFn: () => fetchOT('pending'), enabled: isSupervisor })
  const { data: jobs = [] }                  = useQuery({ queryKey: ['jobs-current'], queryFn: fetchJobs })

  const myList      = myData?.requests      ?? []
  const pendingList = (pendingData?.requests ?? []).filter((r: any) => r.current_approver_id === userId)

  const createOT = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/ot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ot-my'] })
      toast.success('ส่งคำขอ OT แล้ว')
      setShowForm(false)
      setForm({ ot_date: '', start_time: '18:00', end_time: '20:00', job_id: '', reason: '' })
    },
    onError: (e: Error) => toast.error('ไม่สามารถส่งคำขอ OT', e.message),
  })

  const approveOT = useMutation({
    mutationFn: async (id: string) => {
      const res  = await fetch(`/api/ot/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ot-pending'] })
      qc.invalidateQueries({ queryKey: ['ot-my'] })
      toast.success('อนุมัติ OT แล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const rejectOT = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res  = await fetch(`/api/ot/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ot-pending'] })
      setRejectId(null)
      setRejectReason('')
      toast.success('ปฏิเสธ OT แล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const calcHours = () => {
    if (!form.start_time || !form.end_time) return 0
    const [sh, sm] = form.start_time.split(':').map(Number)
    const [eh, em] = form.end_time.split(':').map(Number)
    return Math.max(0, parseFloat(((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2)))
  }

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-500" />
          <h1>คำขอทำงานล่วงเวลา (OT)</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="w-4 h-4" />
          ขอทำ OT
        </button>
      </div>

      {/* New OT Form */}
      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">ยื่นขอทำงานล่วงเวลา</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="form-label">วันที่ขอทำ OT *</label>
              <input type="date" value={form.ot_date}
                onChange={e => setForm(f => ({ ...f, ot_date: e.target.value }))}
                className="form-input" min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="form-label">เวลาเริ่ม *</label>
              <input type="time" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="form-input" />
            </div>
            <div>
              <label className="form-label">เวลาสิ้นสุด *</label>
              <input type="time" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="form-input" />
            </div>
          </div>

          {calcHours() > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800">
              รวม OT: <strong>{calcHours()} ชั่วโมง</strong>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Job Code</label>
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} className="form-input">
                <option value="">— เลือก Job (ถ้ามี) —</option>
                {(jobs as any[]).map((j: any) => (
                  <option key={j.id} value={j.id}>{j.job_code} · {j.name_th}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">เหตุผล / งานที่ทำ</label>
              <input type="text" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="form-input" placeholder="ระบุงานที่ต้องทำล่วงเวลา" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button
              onClick={() => createOT.mutate(form)}
              disabled={!form.ot_date || !form.start_time || !form.end_time || calcHours() <= 0 || createOT.isPending}
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {createOT.isPending ? 'กำลังส่ง...' : 'ส่งคำขอ OT'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      {isSupervisor && (
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          <button onClick={() => setTab('pending')}
            className={cn('px-4 py-1.5 rounded-md text-sm transition-colors', tab === 'pending' ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}>
            รออนุมัติ {pendingList.length > 0 && <span className="ml-1 bg-amber-400 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingList.length}</span>}
          </button>
          <button onClick={() => setTab('my')}
            className={cn('px-4 py-1.5 rounded-md text-sm transition-colors', tab === 'my' ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}>
            ของฉัน
          </button>
        </div>
      )}

      {/* Pending approvals */}
      {tab === 'pending' && isSupervisor && (
        <div className="space-y-3">
          {l2 ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : !pendingList.length ? (
            <div className="card p-8 text-center text-gray-400 text-sm">ไม่มีคำขอ OT รออนุมัติ ✓</div>
          ) : pendingList.map((ot: any) => (
            <div key={ot.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
                  {ot.user?.first_name_th?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{ot.user?.first_name_th} {ot.user?.last_name_th}</p>
                  <p className="text-xs text-gray-400">{ot.user?.employee_code} · {ot.user?.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{formatDateTH(ot.ot_date)}</p>
                  <p className="text-xs text-gray-500">{ot.start_time} – {ot.end_time} ({ot.total_hours} ชม.)</p>
                </div>
                <span className={cn('badge', OT_TYPE_COLOR[ot.ot_type])}>{OT_TYPE_LABEL[ot.ot_type]}</span>
              </div>
              {ot.reason && <p className="px-5 py-2.5 text-sm text-gray-600 bg-gray-50 border-b border-gray-100">{ot.reason}</p>}

              {/* Reject modal inline */}
              {rejectId === ot.id ? (
                <div className="px-5 py-3 space-y-2">
                  <textarea rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    className="form-input resize-none text-sm" placeholder="เหตุผลที่ไม่อนุมัติ..." autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setRejectId(null)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
                    <button
                      onClick={() => rejectOT.mutate({ id: ot.id, reason: rejectReason })}
                      disabled={!rejectReason.trim() || rejectOT.isPending}
                      className="flex-1 rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                    >ยืนยันไม่อนุมัติ</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 px-5 py-3">
                  <button
                    onClick={() => approveOT.mutate(ot.id)}
                    disabled={approveOT.isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                  >
                    {approveOT.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => setRejectId(ot.id)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"
                  >
                    <XCircle className="w-4 h-4" />
                    ไม่อนุมัติ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* My OT list */}
      {tab === 'my' && (
        <div className="card overflow-hidden">
          {l1 ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : !myList.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">ยังไม่มีคำขอ OT</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {myList.map((ot: any) => (
                <div key={ot.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{formatDateTH(ot.ot_date)}</span>
                      <span className={cn('badge text-xs', OT_TYPE_COLOR[ot.ot_type])}>{OT_TYPE_LABEL[ot.ot_type]}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ot.start_time} – {ot.end_time} ({ot.total_hours} ชม.)
                      {ot.job && ` · ${ot.job.job_code}`}
                    </p>
                    {ot.reason && <p className="text-xs text-gray-500 mt-0.5 truncate">{ot.reason}</p>}
                  </div>
                  <span className={cn('badge', STATUS_COLOR[ot.status])}>{STATUS_LABEL[ot.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
