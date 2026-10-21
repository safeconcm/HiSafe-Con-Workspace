'use client'
// src/app/(dashboard)/company-policy/PolicyAccordion.tsx
// 2026-10-21: client-side accordion for the company regulations content —
// split out of page.tsx (which stays a server component so it can keep
// `export const metadata`) per the collapse pattern already used in
// src/app/access/jobs/page.tsx (Set<string> of open keys + ChevronDown/
// ChevronRight from lucide-react), rather than introducing a new UI
// dependency for this one page.
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export type PolicySection = {
  id: string
  title: string
  // Each paragraph/body item is pre-split so we can keep real line breaks
  // and nested sub-lists without reaching for a markdown renderer.
  body: string[]
}

export default function PolicyAccordion({ sections }: { sections: PolicySection[] }) {
  // First section open by default so the page doesn't look empty on load.
  const [open, setOpen] = useState<Set<string>>(new Set([sections[0]?.id]))

  function toggle(id: string) {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        const isOpen = open.has(s.id)
        return (
          <div key={s.id} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
            >
              <span className="flex items-center gap-2.5 font-medium text-gray-800">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold shrink-0">
                  {i + 1}
                </span>
                {s.title}
              </span>
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-2">
                {s.body.map((p, j) => (
                  <p key={j} className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
