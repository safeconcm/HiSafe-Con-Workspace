'use client'
// src/components/layout/NewAnnouncementPopup.tsx
// Lightweight, non-blocking toast for regular (require_ack = false)
// announcements the user hasn't seen yet — separate from MustReadPopup,
// which blocks the whole screen and forces an explicit "รับทราบ" click for
// announcements HR marked as must-read. This one just pops in from the
// corner, and clears itself automatically: dismissing it (✕, clicking to
// view, or letting it time out) all mark it as seen and it never shows
// again. Shows one at a time, queued, so several new announcements don't
// all pop in on top of each other.

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, X } from 'lucide-react'
import { cn } from '@/utils'
import Link from 'next/link'

type Announcement = {
  id: string
  category: string
  title: string
  body: string
  image_url: string | null
  created_at: string
}

const AUTO_DISMISS_MS = 8000

async function fetchUnseen(): Promise<Announcement[]> {
  const res  = await fetch('/api/announcements/unseen')
  const json = await res.json()
  if (!res.ok) return []
  return json.data?.announcements ?? []
}

export function NewAnnouncementPopup() {
  const { data: queue = [] } = useQuery({
    queryKey: ['announcements-unseen'],
    queryFn:  fetchUnseen,
    staleTime: 60_000,
  })

  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useState(false)

  const pending = queue.filter(a => !cleared.has(a.id))
  const current = pending[0]

  // Fade in shortly after a new item becomes current, so consecutive queued
  // items don't feel like one item instantly morphing into the next.
  useEffect(() => {
    if (!current) { setVisible(false); return }
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [current?.id])

  const clear = (id: string) => {
    setVisible(false)
    // Best-effort — same endpoint the must-read popup uses, just without the
    // blocking requirement. Fire-and-forget: even if this fails, the toast
    // will just resurface next page load, which is harmless.
    fetch(`/api/announcements/${id}/ack`, { method: 'POST' }).catch(() => {})
    setTimeout(() => setCleared(prev => new Set(prev).add(id)), 200)
  }

  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => clear(current.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  if (!current) return null

  return (
    <div
      className={cn(
        'fixed bottom-5 right-5 z-40 w-full max-w-sm transition-all duration-300',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}
    >
      <div className="rounded-xl bg-white shadow-lg border border-gray-200 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4 text-blue-700" />
          </div>
          <Link
            href="/announcements"
            onClick={() => clear(current.id)}
            className="flex-1 min-w-0"
          >
            <p className="text-xs text-blue-700 font-medium">ประกาศใหม่</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5 line-clamp-1">{current.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{current.body}</p>
          </Link>
          <button
            onClick={() => clear(current.id)}
            className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="ปิด"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {pending.length > 1 && (
          <div className="px-4 pb-2 -mt-1">
            <span className="text-[11px] text-gray-400">เหลืออีก {pending.length - 1} ประกาศใหม่</span>
          </div>
        )}
      </div>
    </div>
  )
}
