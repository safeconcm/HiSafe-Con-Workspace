'use client'
// src/components/layout/DashboardShell.tsx
// Coordinates the mobile/tablet hamburger (☰) drawer between Topbar and
// Sidebar. Both are rendered as siblings by the (dashboard) layout, which is
// a Server Component with no client state of its own — Topbar's menu button
// previously had no onClick at all, and Sidebar's <aside> was `hidden
// lg:flex` with no reveal mechanism, so the button did nothing below the lg
// breakpoint (reported 2026-07-13: "Tablet, smart phone ปุ่มกดที่วงสีแดง...
// กดใช้งานไม่ได้"). This client wrapper owns the open/close state and is the
// only thing that changed — desktop (lg:) layout/behavior is untouched.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { FloatingAIChat } from '@/components/ai/FloatingAIChat'
import type { SessionUser } from '@/types/database'

interface DashboardShellProps {
  session: SessionUser
  company: { code: string; name_th: string; logo_url: string | null } | null
  children: React.ReactNode
}

export function DashboardShell({ session, company, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // CONNEX AI (2026-10-20, "ข้อ 2") — owned here so the Topbar button and
  // the widget itself (mounted once for every (dashboard) page) share one
  // open/closed state, instead of /hub's self-contained version.
  const [aiOpen, setAiOpen] = useState(false)
  const pathname = usePathname()

  // Belt-and-suspenders: also auto-close on any route change (covers
  // browser back/forward, redirects, etc.), on top of the explicit
  // onClick={onClose} wired to each Sidebar link.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      {/* Backdrop — mobile/tablet only, tapping it closes the drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        session={session}
        company={company}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar
          session={session}
          onMenuClick={() => setMobileOpen(o => !o)}
          onAIClick={() => setAiOpen(o => !o)}
          aiOpen={aiOpen}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <FloatingAIChat open={aiOpen} onOpenChange={setAiOpen} hideToggleButton />
    </>
  )
}
