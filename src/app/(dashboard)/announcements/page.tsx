'use client'
// src/app/(dashboard)/announcements/page.tsx
// Employee-facing view of company announcements/news.
// Organized into tabs (ทั้งหมด / ยังไม่อ่าน / ต้องรับทราบ) so people can
// jump straight to what needs their attention instead of scrolling a flat
// list. "ยังไม่อ่าน" / read status here is the same underlying
// announcement_reads tracking used by the must-read popup and the
// lightweight new-announcement toast (see NewAnnouncementPopup) — reading
// an announcement anywhere (popup, or expanding/"อ่านแล้ว" here) clears it
// everywhere.
//
// Cards are collapsed by default (title + short snippet) — clicking one
// expands it to show the full body and, if present, the attachment: an
// inline image, or an "เปิดไฟล์แนบ" link for PDF/Word/Excel attachments
// (user feedback 2026-07-12: "กดไปที่ประกาศนั้นๆ แล้วขยายข้อความออกมา แล้ว
// จะไปที่ไฟล์ แล้วแสดง").

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Loader2, Check, AlertTriangle, ChevronDown, FileText } from 'lucide-react'
import { cn, formatDateTH } from '@/utils'

type Category = 'general' | 'policy' | 'event' | 'emergency'
type Tab = 'all' | 'unread' | 'must_ack'

const CATEGORY_LABEL: Record<Category, string> = {
  general:   'ทั่วไป',
  policy:    'นโยบาย',
  event:     'กิจกรรม',
  emergency: 'ฉุกเฉิน',
}
const CATEGORY_COLOR: Record<Category, string> = {
  general:   'bg-gray-100 text-gray-700',
  policy:    'bg-blue-100 text-blue-700',
  event:     'bg-purple-100 text-purple-700',
  emergency: 'bg-red-100 text-red-700',
}

const isImageType = (type: string | null | undefined) => !!type && type.startsWith('image/')

type AnnouncementRow = {
  id: string
  category: Category
  title: string
  body: string
  attachment_url: string | null
  attachment_type: string | null
  attachment_name: string | null
  require_ack: boolean
  created_at: string
  is_read: boolean
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json() } catch { return null }
}

async function fetchAnnouncements(): Promise<AnnouncementRow[]> {
  const res  = await fetch('/api/announcements')
  const json = await safeJson(res)
  if (!res.ok) throw new Error(json?.error || `โหลดประกาศไม่สำเร็จ (${res.status})`)
  return json?.data?.announcements ?? []
}

async function markRead(id: string) {
  const res = await fetch(`/api/announcements/${id}/ack`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed')
}

export default function AnnouncementsPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const qc = useQueryClient()

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn:  fetchAnnouncements,
  })

  const readMutation = useMutation({
    mutationFn: markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })

  const toggleExpanded = (a: AnnouncementRow) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(a.id)) next.delete(a.id)
      else next.add(a.id)
      return next
    })
    // Expanding to read the full announcement counts as reading it — no
    // need to also hunt for a separate "อ่านแล้ว" button.
    if (!a.is_read && !expanded.has(a.id)) readMutation.mutate(a.id)
  }

  const unreadCount  = announcements.filter(a => !a.is_read).length
  const mustAckCount = announcements.filter(a => a.require_ack && !a.is_read).length

  const filtered = announcements.filter(a => {
    if (tab === 'unread')   return !a.is_read
    if (tab === 'must_ack') return a.require_ack
    return true
  })

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'all',      label: 'ทั้งหมด' },
    { key: 'unread',   label: 'ยังไม่อ่าน',  count: unreadCount },
    { key: 'must_ack', label: 'ต้องรับทราบ', count: mustAckCount },
  ]

  return (
    <div className="page-container space-y-5 max-w-3xl">
      <div className="flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-gray-500" />
        <h1>ประกาศ / ข่าวสาร</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
            {!!t.count && (
              <span className={cn(
                'text-[11px] rounded-full px-1.5 py-0.5 leading-none',
                tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(a => {
            const isOpen = expanded.has(a.id)
            const hasImage = a.attachment_url && isImageType(a.attachment_type)
            const hasFile  = a.attachment_url && !isImageType(a.attachment_type)
            return (
              <div key={a.id} className={cn('card overflow-hidden', !a.is_read && 'ring-1 ring-blue-200')}>
                {isOpen && hasImage && (
                  <img src={a.attachment_url!} alt={a.title} className="w-full max-h-64 object-cover" />
                )}
                <div
                  onClick={() => toggleExpanded(a)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(a) } }}
                  role="button" tabIndex={0}
                  className="card-body w-full text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('badge', CATEGORY_COLOR[a.category])}>
                      {CATEGORY_LABEL[a.category]}
                    </span>
                    {a.require_ack && (
                      <span className="badge bg-amber-100 text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> ต้องรับทราบ
                      </span>
                    )}
                    {!a.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500" title="ยังไม่อ่าน" />
                    )}
                    <span className="text-xs text-gray-400">{formatDateTH(a.created_at)}</span>
                    <ChevronDown className={cn('w-4 h-4 text-gray-400 ml-auto transition-transform shrink-0', isOpen && 'rotate-180')} />
                  </div>
                  <p className="text-base font-semibold text-gray-900 mt-2">{a.title}</p>
                  <p className={cn('text-sm text-gray-600 mt-1 whitespace-pre-line', !isOpen && 'line-clamp-2')}>
                    {a.body}
                  </p>

                  {isOpen && hasFile && (
                    <a
                      href={a.attachment_url!} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate max-w-[220px]">{a.attachment_name || 'เปิดไฟล์แนบ'}</span>
                    </a>
                  )}

                  {!isOpen && !a.is_read && (
                    <span className="mt-2 flex items-center gap-1.5 text-xs text-blue-600">
                      <Check className="w-3.5 h-3.5" /> แตะเพื่ออ่าน
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {!filtered.length && (
            <div className="card card-body text-center text-gray-400 py-12 text-sm">
              {tab === 'unread' ? 'อ่านครบทุกประกาศแล้ว' : tab === 'must_ack' ? 'ไม่มีประกาศที่ต้องรับทราบ' : 'ยังไม่มีประกาศ'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
