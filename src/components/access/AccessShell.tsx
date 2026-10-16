'use client'
// src/components/access/AccessShell.tsx
// Mobile drawer coordinator for the CONNEX Access module — same pattern as
// src/components/layout/DashboardShell.tsx (owns the open/close state so
// AccessSidebar's hamburger toggle works below the lg breakpoint), just
// pointed at AccessSidebar instead of EM's Sidebar. Reuses the existing
// Topbar as-is (notification bell + user chip — nothing EM-specific there).
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AccessSidebar } from './AccessSidebar'
import { Topbar } from '@/components/layout/Topbar'
import type { SessionUser } from '@/types/database'

interface AccessShellProps {
  session: SessionUser
  company: { code: string; name_th: string; logo_url: string | null } | null
  children: React.ReactNode
}

export function AccessShell({ session, company, children }: AccessShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <AccessSidebar
        session={session}
        company={company}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar session={session} onMenuClick={() => setMobileOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  )
}
