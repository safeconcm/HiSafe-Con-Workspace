'use client'
// src/app/(dashboard)/announcements/page.tsx
// Employee-facing view of company announcements/news.

import { useQuery } from '@tanstack/react-query'
import { Megaphone, Loader2 } from 'lucide-react'
import { cn, formatDateTH } from '@/utils'

type Category = 'general' | 'policy' | 'event' | 'emergency'

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

async function fetchAnnouncements() {
  const res  = await fetch('/api/announcements')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data?.announcements ?? []
}

export default function AnnouncementsPage() {
  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn:  fetchAnnouncements,
  })

  return (
    <div className="page-container space-y-5 max-w-3xl">
      <div className="flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-gray-500" />
        <h1>ประกาศ / ข่าวสาร</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {(announcements as any[]).map((a: any) => (
            <div key={a.id} className="card overflow-hidden">
              <img src={a.image_url} alt={a.title} className="w-full max-h-64 object-cover" />
              <div className="card-body">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('badge', CATEGORY_COLOR[a.category as Category])}>
                    {CATEGORY_LABEL[a.category as Category]}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTH(a.created_at)}</span>
                </div>
                <p className="text-base font-semibold text-gray-900 mt-2">{a.title}</p>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{a.body}</p>
              </div>
            </div>
          ))}
          {!announcements.length && (
            <div className="card card-body text-center text-gray-400 py-12 text-sm">
              ยังไม่มีประกาศ
            </div>
          )}
        </div>
      )}
    </div>
  )
}
