'use client'
// src/components/layout/MustReadPopup.tsx
// Blocking popup shown on top of the dashboard for any announcement HR
// marked "require_ack = true" that this user hasn't acknowledged yet.
// Shows one at a time; clicking "รับทราบ" records the ack then advances to
// the next unread one (if any). Does not affect normal announcements
// (require_ack = false), which only ever appear on the regular
// ประกาศ/ข่าวสาร page — this popup is purely additive.

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Loader2 } from 'lucide-react'
import { formatDateTH } from '@/utils'

type Announcement = {
  id: string
  category: string
  title: string
  body: string
  attachment_url: string | null
  attachment_type: string | null
  created_at: string
}

const isImageType = (type: string | null | undefined) => !!type && type.startsWith('image/')

async function fetchUnread(): Promise<Announcement[]> {
  const res  = await fetch('/api/announcements/unread')
  const json = await res.json()
  if (!res.ok) return []
  return json.data?.announcements ?? []
}

export function MustReadPopup() {
  const { data: queue = [] } = useQuery({
    queryKey: ['announcements-unread'],
    queryFn:  fetchUnread,
    staleTime: 60_000,
  })

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [acking, setAcking] = useState(false)

  const pending = queue.filter(a => !dismissed.has(a.id))
  const current = pending[0]

  // Prevent background scroll while a must-read popup is showing.
  useEffect(() => {
    if (current) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [current])

  if (!current) return null

  const ack = async () => {
    setAcking(true)
    try {
      await fetch(`/api/announcements/${current.id}/ack`, { method: 'POST' })
    } finally {
      setDismissed(prev => new Set(prev).add(current.id))
      setAcking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden">
        {current.attachment_url && isImageType(current.attachment_type) && (
          <img src={current.attachment_url} alt={current.title} className="w-full max-h-56 object-cover" />
        )}
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-700">
            <Megaphone className="w-5 h-5 shrink-0" />
            <span className="text-xs font-medium">ประกาศสำคัญ — กรุณาอ่านและกดรับทราบ</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{current.title}</h2>
          <p className="text-xs text-gray-400">{formatDateTH(current.created_at)}</p>
          <p className="text-sm text-gray-700 whitespace-pre-line max-h-64 overflow-y-auto">{current.body}</p>
          <div className="pt-2 flex items-center justify-between">
            {pending.length > 1 && (
              <span className="text-xs text-gray-400">เหลืออีก {pending.length - 1} ประกาศ</span>
            )}
            <button
              onClick={ack}
              disabled={acking}
              className="ml-auto rounded-lg bg-blue-700 text-white px-5 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {acking && <Loader2 className="w-4 h-4 animate-spin inline mr-2" />}
              รับทราบแล้ว
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
