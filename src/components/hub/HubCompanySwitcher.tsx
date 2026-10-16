'use client'
// src/components/hub/HubCompanySwitcher.tsx
// Multi-company switcher for the hub header (2026-10-16) — per feedback
// that an admin managing both SAFECON and HIGHCON had no way to pick a
// company on /hub (only the EM sidebar's CompanySwitcher had this). Same
// backend (/api/auth/switch-company) as src/components/layout/Sidebar.tsx's
// CompanySwitcher, but using the hub's own visual language (real logo
// images on a dark header) instead of that component's text-initial
// badges — kept as its own component rather than forcing one component to
// serve two different visual contexts. Falls back to a plain
// non-interactive badge when the user only has one company (the common
// case — most people belong to exactly one).
import { useState } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'

type Company = { id: string; code: string; name_th: string }

function logoSrc(code?: string) {
  return code === 'HIGHCON' ? '/logos/highcon.png' : '/logos/safecon.png'
}

export function HubCompanySwitcher({
  current,
  companies,
  userName,
}: {
  current: { code: string; name_th: string } | null
  companies: Company[]
  userName: string
}) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const switchTo = async (companyId: string) => {
    if (switching) return
    setOpen(false)
    setSwitching(true)
    try {
      await fetch('/api/auth/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })
    } finally {
      // Reload on /hub itself (unlike the EM sidebar's switcher, which
      // sends you to /dashboard) — switching company here shouldn't also
      // force you into a module.
      window.location.href = '/hub'
    }
  }

  const badge = (
    <div className="relative w-10 h-10 rounded-lg bg-white shrink-0 overflow-hidden">
      <Image src={logoSrc(current?.code)} alt={current?.code ?? 'CONNEX'} fill className="object-contain p-1" />
    </div>
  )

  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-3 min-w-0">
        {badge}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{current?.name_th ?? 'CONNEX'}</p>
          <p className="text-xs text-slate-400 truncate">{userName}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-3 min-w-0 text-left disabled:opacity-60"
      >
        {badge}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {switching ? 'กำลังสลับ...' : (current?.name_th ?? 'CONNEX')}
          </p>
          <p className="text-xs text-slate-400 truncate">{userName} · แตะเพื่อสลับบริษัท</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-60 rounded-xl border border-gray-200 bg-white shadow-2xl shadow-black/40 z-20 overflow-hidden">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => switchTo(c.id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left hover:bg-gray-50 ${
                c.code === current?.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              <div className="relative w-7 h-7 rounded-md bg-white border border-gray-100 shrink-0 overflow-hidden">
                <Image src={logoSrc(c.code)} alt={c.code} fill className="object-contain p-0.5" />
              </div>
              {c.name_th}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
