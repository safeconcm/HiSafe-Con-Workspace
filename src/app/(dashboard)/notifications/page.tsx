'use client'
// src/app/(dashboard)/notifications/page.tsx
import { useState }    from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDateTime, cn } from '@/utils'
import {
  Bell, CheckCheck, CalendarDays, Clock,
  ChevronRight, Loader2, Check, FileText, UserCheck, CalendarClock,
  MessageCircleQuestion, Megaphone,
} from 'lucide-react'
import Link from 'next/link'

const EVENT_ICON: Record<string, React.ElementType> = {
  leave_submitted:    CalendarDays,
  leave_approved:     CalendarDays,
  leave_rejected:     CalendarDays,
  leave_cancelled:    CalendarDays,
  leave_balance_adjusted: CalendarDays,
  timesheet_submitted:  Clock,
  timesheet_approved:   Clock,
  timesheet_rejected:   Clock,
  contract_expiring:    FileText,
  probation_reminder:   UserCheck,
  leave_expiring:       CalendarClock,
  inquiry_submitted:    MessageCircleQuestion,
  inquiry_reply:        MessageCircleQuestion,
  announcement:         Megaphone,
  general:              Bell,
}

const EVENT_COLOR: Record<string, string> = {
  leave_approved:     'bg-green-100 text-green-700',
  leave_rejected:     'bg-red-100 text-red-700',
  leave_submitted:    'bg-blue-100 text-blue-700',
  leave_cancelled:    'bg-gray-100 text-gray-500',
  leave_balance_adjusted: 'bg-purple-100 text-purple-700',
  timesheet_approved:   'bg-green-100 text-green-700',
  timesheet_rejected:   'bg-red-100 text-red-700',
  timesheet_submitted:  'bg-blue-100 text-blue-700',
  contract_expiring:    'bg-amber-100 text-amber-700',
  probation_reminder:   'bg-amber-100 text-amber-700',
  leave_expiring:       'bg-amber-100 text-amber-700',
  inquiry_submitted:    'bg-indigo-100 text-indigo-700',
  inquiry_reply:        'bg-indigo-100 text-indigo-700',
  announcement:         'bg-blue-100 text-blue-700',
  general:              'bg-gray-100 text-gray-600',
}

async function fetchNotifications(page: number) {
  const res  = await fetch(`/api/notifications?page=${page}&limit=20`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

async function markRead(id: string) {
  await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
}

async function markAllRead() {
  await fetch('/api/notifications/read-all', { method: 'PATCH' })
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', page],
    queryFn:  () => fetchNotifications(page),
    refetchInterval: 30_000,
  })

  const notifications: any[] = data?.notifications ?? []
  const unreadCount   = data?.unread_count ?? 0
  const total         = data?.total ?? 0

  const readMutation = useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-page'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  const readAllMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-page'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  const getLink = (n: any) => {
    if (!n.reference_id) return null
    if (n.reference_type === 'leave_request')  return `/leave/${n.reference_id}`
    if (n.reference_type === 'timesheet') {
      // Need to parse year/month from timesheet — link to detail via id lookup
      return `/timesheet`
    }
    // contract_expiring and probation_reminder both reference a contract id,
    // but should land on different pages depending on which one fired.
    if (n.reference_type === 'contract' && n.event_type === 'probation_reminder') {
      return `/hr/probation/${n.reference_id}`
    }
    if (n.reference_type === 'contract') return `/hr/contracts/${n.reference_id}`
    if (n.reference_type === 'leave_balance') return `/leave/my`
    if (n.reference_type === 'inquiry') return `/inquiries`
    if (n.reference_type === 'announcement') return `/announcements`
    return null
  }

  const handleClick = (n: any) => {
    if (n.status !== 'read') readMutation.mutate(n.id)
  }

  return (
    <div className="page-container max-w-2xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-500" />
          <h1>การแจ้งเตือน</h1>
          {unreadCount > 0 && (
            <span className="badge bg-red-100 text-red-700">{unreadCount} ใหม่</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:opacity-60"
          >
            <CheckCheck className="w-4 h-4" />
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !notifications.length ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Bell className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100 overflow-hidden">
          {notifications.map((n: any) => {
            const Icon  = EVENT_ICON[n.event_type] ?? Bell
            const color = EVENT_COLOR[n.event_type] ?? 'bg-gray-100 text-gray-600'
            const link  = getLink(n)
            const isNew = n.status !== 'read'

            const inner = (
              <div
                onClick={() => handleClick(n)}
                className={cn(
                  'flex items-start gap-4 px-5 py-4 transition-colors cursor-pointer',
                  isNew ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-gray-50'
                )}
              >
                {/* Icon */}
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', color)}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm leading-snug', isNew ? 'font-semibold text-gray-900' : 'font-normal text-gray-700')}>
                      {n.title}
                    </p>
                    {isNew && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                </div>

                {link && <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-3" />}
              </div>
            )

            return link ? (
              <Link key={n.id} href={link}>{inner}</Link>
            ) : (
              <div key={n.id}>{inner}</div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">
            ก่อนหน้า
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">หน้า {page} / {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">
            ถัดไป
          </button>
        </div>
      )}
    </div>
  )
}
