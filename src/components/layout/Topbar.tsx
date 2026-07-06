'use client'
// src/components/layout/Topbar.tsx
import { Bell, Menu } from 'lucide-react'
import Link from 'next/link'
import { cn, fullNameTH, ROLE_LABEL } from '@/utils'
import type { SessionUser } from '@/types/database'
import { useQuery } from '@tanstack/react-query'

interface TopbarProps {
  session: SessionUser
}

export function Topbar({ session }: TopbarProps) {
  // Unread notification count
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?unread=true&limit=1')
      const json = await res.json()
      return (json.data?.unread_count as number) ?? 0
    },
    refetchInterval: 30_000, // poll every 30s
  })

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-3 shrink-0 no-print">

      {/* Mobile menu button */}
      <button className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100">
        <Menu className="w-5 h-5 text-gray-600" />
      </button>

      {/* Breadcrumb / page title placeholder — filled by each page */}
      <div id="topbar-title" className="flex-1 text-sm text-gray-600" />

      {/* Right actions */}
      <div className="flex items-center gap-2">

        {/* Notification bell */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Bell className="w-5 h-5 text-gray-600" />
          {!!unreadCount && unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User chip */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium">
            {session.first_name_th.charAt(0)}
          </div>
          <div className="text-xs">
            <p className="font-medium text-gray-800 leading-tight">
              {fullNameTH(session)}
            </p>
            <p className="text-gray-400 leading-tight">
              {ROLE_LABEL[session.role]}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
