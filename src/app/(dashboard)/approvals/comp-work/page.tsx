'use client'
// src/app/(dashboard)/approvals/comp-work/page.tsx — doubles as comp-work
// list for all roles, mirrors /approvals/ot's structure exactly (create +
// approve + reject + list in one page). See src/lib/comp-work.ts for why
// this is a separate feature from OT: no extra pay, instead it refunds a
// leave day 1:1 and still counts the hours toward Job Direct Cost.

import { useState }       from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }          from '@/components/ui/Toaster'
import { cn, formatDateTH, LEAVE_TYPE_LABEL } from '@/utils'
import {
  CalendarClock, Plus, CheckCircle2, XCircle, Loader2,
} from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ',
}

function useCurrentUser() {
  if (typeof window === 'undefined') return { id: '', role: '' }
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('connex_session='))
    if (!raw) return { id: '', role: '' }
    const s = JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))
    return { id: s.id, role: s.role }
  } catch { return { id: '', role: '' } }
}

async function fetchCompWork(status?: string, ownOnly?: boolean) {
  const params = new URLSearchParams({ limit: '50' })
  if (status)  params.set('status', status)
  if (ownOnly) params.set('own_only', '1')
  const res  = await fetch(`/api/comp-work?${params}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

async function fetchJobs() {
  const res  = await fetch(`/api/admin/jobs?year=${new Date().getFullYear()}`)
  const json = await res.json()
  return json.data?.jobs ?? []
}

const OFFSET_LEAVE_TYPES = ['study', 'annual', 'personal', 'sick', 'other'] as const

export default function CompWorkPage() {
  const { id: userId, role } = useCurrentUser()
  const qc = useQueryClient()
  const isSupervisor = ['supervisor','hr','admin'].includes(role)

  const [tab,       setTab]       = useState<'my'|'pending'>(isSupervisor ? 'pending' : 'my')
  const [showForm,  setShowForm]  = useState(false)
  const [rejectId,  setRejectId]  = useState<string|null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [form, setForm] = useState({
    work_date: '', job_id: '', hours: 8, offset_leave_type: 'study' as string, reason: '',
  })

  const { data: myData,      isLoading: l1 } = useQuery({ queryKey: ['comp-work-my'],      queryFn: () => fetchCompWork(undefined, true) })
  const { data: pendingData, isLoading: l2 } = useQuery({ queryKey: ['comp-work-pending'], queryFn: () => fetchCompWork('pending'), enabled: isSupervisor })
  const { data: jobs = [] }                  = useQuery({ queryKey: ['jobs-current'], queryFn: fetchJobs })

  const myList      = myData?.requests      ?? []
  const pendingList = (pendingData?.requests ?? []).filter((r: any) => r.current_approver_id === userId)

  const createCW = useMutation({
    mutationFn: async (body: typeof form) => {
      const res  = await fetch('/api/comp-work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comp-work-my'] })
      toast.success('ส่งคำขอทำงานชดเชยแล้ว')
      setShowForm(false)
      setForm({ work_date: '', job_id: '', hours: 8, offset_leave_type: 'study', reason: '' })
    },
    onError: (e: Error) => toast.error('ไม่สามารถส่งคำขอได้', e.message),
  })

  const approveCW = useMutation({
    mutationFn: async (id: string) => {
      const res  = await fetch(`/api/comp-work/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comp-work-pending'] })
      qc.invalidateQueries({ queryKey: ['comp-work-my'] })
      toast.success('อนุมัติงานชดเชยแล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const rejectCW = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res  = await fetch(`/api/comp-work/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comp-work-pending'] })
      setRejectId(null)
      setRejectReason('')
      toast.success('ปฏิเสธคำขอแล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-gray-500" />
          <h1>ทำงานชดเชยวันหยุด</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="w-4 h-4" />
          ขอทำงานชดเชย
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">ยื่นขอทำงานชดเชยวันหยุด/วันอาทิตย์</h3>
          <p className="text-xs text-gray-400">
            ใช้สำหรับวันหยุดสุดสัปดาห์หรือวันหยุดบริษัทเท่านั้น (ไม่ใช่วันทำงานปกติ) — ชั่วโมงที่ทำจะนับเป็นชั่วโมงทำงานจริงของ Job ที่เลือก
            และวันลาที่เลือกด้านล่างจะถูกคืน 1 วันให้อัตโนมัติ (ไม่มีการจ่ายค่า OT เพิ่ม)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="form-label">วันที่ทำงานชดเชย *</label>
              <input type="date" value={form.work_date}
                onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))}
                className="form-input" />
            </div>
            <div>
              <label className="form-label">จำนวนชั่วโมง *</label>
              <select value={form.hours} onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} className="form-input">
                <option value={8}>เต็มวัน (8 ชม.)</option>
                <option value={4}>ครึ่งวัน (4 ชม.)</option>
              </select>
            </div>
            <div>
              <label className="form-label">ชดเชยวันลาประเภท *</label>
              <select value={form.offset_leave_type} onChange={e => setForm(f => ({ ...f, offset_leave_type: e.target.value }))} className="form-input">
                {OFFSET_LEAVE_TYPES.map(lt => (
                  <option key={lt} value={lt}>{LEAVE_TYPE_LABEL[lt as keyof typeof LEAVE_TYPE_LABEL] ?? lt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Job Code *</label>
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} className="form-input">
                <option value="">— เลือก Job —</option>
                {(jobs as any[]).map((j: any) => (
                  <option key={j.id} value={j.id}>{j.job_code} · {j.name_th}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">เหตุผล</label>
              <input type="text" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="form-input" placeholder="ระบุงานที่ทำ" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button
              onClick={() => createCW.mutate(form)}
              disabled={!form.work_date || !form.job_id || createCW.isPending}
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {createCW.isPending ? 'กำลังส่ง...' : 'ส่งคำขอ'}
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
            <div className="card p-8 text-center text-gray-400 text-sm">ไม่มีคำขอทำงานชดเชยรออนุมัติ ✓</div>
          ) : pendingList.map((cw: any) => (
            <div key={cw.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
                  {cw.user?.first_name_th?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{cw.user?.first_name_th} {cw.user?.last_name_th}</p>
                  <p className="text-xs text-gray-400">{cw.user?.employee_code} · {cw.user?.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{formatDateTH(cw.work_date)}</p>
                  <p className="text-xs text-gray-500">{cw.hours} ชม. · ชดเชย {LEAVE_TYPE_LABEL[cw.offset_leave_type as keyof typeof LEAVE_TYPE_LABEL] ?? cw.offset_leave_type}</p>
                </div>
                {cw.job && <span className="badge bg-blue-50 text-blue-700">{cw.job.job_code}</span>}
              </div>
              {cw.reason && <p className="px-5 py-2.5 text-sm text-gray-600 bg-gray-50 border-b border-gray-100">{cw.reason}</p>}

              {rejectId === cw.id ? (
                <div className="px-5 py-3 space-y-2">
                  <textarea rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    className="form-input resize-none text-sm" placeholder="เหตุผลที่ไม่อนุมัติ..." autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setRejectId(null)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
                    <button
                      onClick={() => rejectCW.mutate({ id: cw.id, reason: rejectReason })}
                      disabled={!rejectReason.trim() || rejectCW.isPending}
                      className="flex-1 rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                    >ยืนยันไม่อนุมัติ</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 px-5 py-3">
                  <button
                    onClick={() => approveCW.mutate(cw.id)}
                    disabled={approveCW.isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                  >
                    {approveCW.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => setRejectId(cw.id)}
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

      {/* My list */}
      {tab === 'my' && (
        <div className="card overflow-hidden">
          {l1 ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : !myList.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">ยังไม่มีคำขอทำงานชดเชย</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {myList.map((cw: any) => (
                <div key={cw.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{formatDateTH(cw.work_date)}</span>
                      <span className="badge text-xs bg-blue-50 text-blue-700">{cw.hours} ชม.</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ชดเชย{LEAVE_TYPE_LABEL[cw.offset_leave_type as keyof typeof LEAVE_TYPE_LABEL] ?? cw.offset_leave_type}
                      {cw.job && ` · ${cw.job.job_code}`}
                    </p>
                    {cw.reason && <p className="text-xs text-gray-500 mt-0.5 truncate">{cw.reason}</p>}
                  </div>
                  <span className={cn('badge', STATUS_COLOR[cw.status])}>{STATUS_LABEL[cw.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
