'use client'
// src/app/(dashboard)/inquiries/page.tsx
// Async question-and-answer with HR — submit a question, HR replies when
// they get to it, thread stays as a record. Not live chat.
import { useState }  from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }     from '@/components/ui/Toaster'
import { cn, fullNameTH, formatDateTime } from '@/utils'
import {
  MessageCircleQuestion, Loader2, ChevronDown, ChevronUp,
  Send, CheckCircle2, RotateCcw, Plus, X,
} from 'lucide-react'

// Same document.cookie read used by admin/users, approvals/timesheet, etc.
// (see connex_session comment in middleware.ts) — avoids an extra round-trip
// just to know the viewer's role for UI branching.
function useCurrentRole(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('connex_session='))
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))?.role ?? ''
  } catch { return '' }
}

const STATUS_COLOR: Record<string, string> = {
  open:     'bg-amber-100 text-amber-800',
  answered: 'bg-blue-100 text-blue-700',
  closed:   'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'รอตอบ', answered: 'ตอบแล้ว', closed: 'ปิดแล้ว',
}
const CATEGORY_LABEL: Record<string, string> = {
  general: 'ทั่วไป', leave: 'การลา', payroll: 'เงินเดือน/ค่าแรง',
  contract: 'สัญญาจ้าง', benefits: 'สวัสดิการ', other: 'อื่นๆ',
}

export default function InquiriesPage() {
  const role = useCurrentRole()
  const isStaff = role === 'hr' || role === 'admin'

  const [status, setStatus]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew]   = useState(false)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['inquiries', status],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: '50' })
      if (status) qs.set('status', status)
      const res  = await fetch(`/api/inquiries?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  const items = data?.inquiries ?? []

  const createInquiry = useMutation({
    mutationFn: async (payload: { subject: string; category: string; message: string }) => {
      const res  = await fetch('/api/inquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      toast.success('ส่งคำถามแล้ว', 'HR จะตอบกลับโดยเร็วที่สุด')
      setShowNew(false)
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const reply = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res  = await fetch(`/api/inquiries/${id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiry-detail', vars.id] })
      setReplyDraft(prev => ({ ...prev, [vars.id]: '' }))
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const setInquiryStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'close' | 'reopen' }) => {
      const res  = await fetch(`/api/inquiries/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      toast.success('อัปเดตสถานะแล้ว')
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  return (
    <div className="page-container max-w-3xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5 text-gray-500" />
          <h1>{isStaff ? 'คำถามจากพนักงาน' : 'ติดต่อ HR'}</h1>
        </div>
        {!isStaff && (
          <button
            onClick={() => setShowNew(s => !s)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800"
          >
            {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showNew ? 'ยกเลิก' : 'ตั้งคำถามใหม่'}
          </button>
        )}
      </div>

      {showNew && !isStaff && (
        <NewInquiryForm
          onSubmit={payload => createInquiry.mutate(payload)}
          isPending={createInquiry.isPending}
        />
      )}

      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        {['', 'open', 'answered', 'closed'].map(s => (
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
        <div className="card p-10 text-center text-gray-400 text-sm">
          {isStaff ? 'ไม่มีคำถามจากพนักงาน' : 'ยังไม่มีคำถามที่คุณส่ง — กดปุ่ม "ตั้งคำถามใหม่" เพื่อเริ่ม'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it: any) => {
            const isOpen = expanded === it.id
            return (
              <InquiryCard
                key={it.id}
                inquiry={it}
                isOpen={isOpen}
                isStaff={isStaff}
                onToggle={() => setExpanded(isOpen ? null : it.id)}
                draft={replyDraft[it.id] ?? ''}
                onDraftChange={v => setReplyDraft(prev => ({ ...prev, [it.id]: v }))}
                onReply={() => {
                  const msg = (replyDraft[it.id] ?? '').trim()
                  if (msg) reply.mutate({ id: it.id, message: msg })
                }}
                replyPending={reply.isPending}
                onClose={() => setInquiryStatus.mutate({ id: it.id, action: 'close' })}
                onReopen={() => setInquiryStatus.mutate({ id: it.id, action: 'reopen' })}
                statusPending={setInquiryStatus.isPending}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewInquiryForm({
  onSubmit, isPending,
}: { onSubmit: (p: { subject: string; category: string; message: string }) => void; isPending: boolean }) {
  const [subject, setSubject]   = useState('')
  const [category, setCategory] = useState('general')
  const [message, setMessage]   = useState('')

  return (
    <div className="card card-body space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">หัวข้อ</label>
        <input value={subject} onChange={e => setSubject(e.target.value)}
          className="form-input" placeholder="เช่น สอบถามเรื่องวันลาคงเหลือ" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">หมวดหมู่</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="form-input w-auto">
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">รายละเอียด</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          className="form-input min-h-[100px]" placeholder="อธิบายคำถามหรือเรื่องที่ต้องการติดต่อ HR" />
      </div>
      <button
        disabled={isPending || !subject.trim() || !message.trim()}
        onClick={() => onSubmit({ subject, category, message })}
        className="flex items-center gap-1.5 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
      >
        <Send className="w-4 h-4" />ส่งคำถาม
      </button>
    </div>
  )
}

function InquiryCard({
  inquiry, isOpen, isStaff, onToggle, draft, onDraftChange, onReply, replyPending,
  onClose, onReopen, statusPending,
}: {
  inquiry: any; isOpen: boolean; isStaff: boolean; onToggle: () => void
  draft: string; onDraftChange: (v: string) => void; onReply: () => void; replyPending: boolean
  onClose: () => void; onReopen: () => void; statusPending: boolean
}) {
  const { data: detail } = useQuery({
    queryKey: ['inquiry-detail', inquiry.id],
    queryFn: async () => {
      const res  = await fetch(`/api/inquiries/${inquiry.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    enabled: isOpen,
  })

  const messages = detail?.messages ?? []

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 text-left"
      >
        {isStaff && (
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold shrink-0">
            {inquiry.user?.first_name_th?.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{inquiry.subject}</p>
          <p className="text-xs text-gray-400">
            {isStaff && <>{fullNameTH(inquiry.user)} · </>}
            {CATEGORY_LABEL[inquiry.category] ?? inquiry.category} · {formatDateTime(inquiry.last_message_at)}
          </p>
        </div>
        <span className={cn('badge', STATUS_COLOR[inquiry.status])}>{STATUS_LABEL[inquiry.status]}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto bg-gray-50">
            {!detail ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : messages.map((m: any) => {
              const senderIsStaff = m.sender?.role === 'hr' || m.sender?.role === 'admin'
              return (
                <div key={m.id} className={cn('flex', senderIsStaff ? 'justify-start' : 'justify-end')}>
                  <div className={cn(
                    'max-w-[80%] rounded-xl px-4 py-2.5',
                    senderIsStaff ? 'bg-blue-50 text-blue-900' : 'bg-white border border-gray-200 text-gray-800'
                  )}>
                    <p className="text-xs font-medium mb-0.5 opacity-70">
                      {senderIsStaff ? `HR · ${fullNameTH(m.sender)}` : fullNameTH(m.sender)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    <p className="text-[10px] opacity-50 mt-1">{formatDateTime(m.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-5 py-3 flex items-center gap-2 border-t border-gray-100">
            {inquiry.status !== 'closed' ? (
              <>
                <input
                  value={draft}
                  onChange={e => onDraftChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onReply() }}
                  placeholder={isStaff ? 'พิมพ์คำตอบ...' : 'พิมพ์ข้อความ...'}
                  className="form-input flex-1"
                />
                <button
                  onClick={onReply}
                  disabled={replyPending || !draft.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-700 text-white px-3 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  disabled={statusPending}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 shrink-0"
                  title="ปิดเรื่อง"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <p className="text-xs text-gray-400">
                  ปิดเรื่องแล้วโดย {fullNameTH(inquiry.closed_by_user)} · {formatDateTime(inquiry.closed_at)}
                </p>
                {isStaff && (
                  <button
                    onClick={onReopen}
                    disabled={statusPending}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />เปิดเรื่องใหม่
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
