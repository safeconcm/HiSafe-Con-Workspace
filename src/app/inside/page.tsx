'use client'
// src/app/inside/page.tsx
// CONNEX Inside — admin-only company-insights dashboard (2026-10-26, "เปิด
// Module Connex Inside ที่ปิด ให้ admin เท่านั้นที่มองเห็น"), reached from
// the hub launcher. Tabbed (2026-10-26 follow-up, "เพิ่มเลยตามที่แนะนำ
// แต่แยก Tab ไว้") so each metric group gets its own tab instead of one long
// scrolling page:
//   - มูลค่างาน: Job Codes revenue summary, by year/client (RevenueTab.tsx)
//   - Headcount / Payroll: reuses the MD dashboard's exec_summary report
//     (HeadcountPayrollTab.tsx)
// More tabs can be added here later without touching either existing one.
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, LineChart, Coins, Users } from 'lucide-react'
import { RevenueTab } from './RevenueTab'
import { HeadcountPayrollTab } from './HeadcountPayrollTab'

const TABS = [
  { key: 'revenue',   label: 'มูลค่างาน',          icon: Coins },
  { key: 'headcount', label: 'Headcount / Payroll', icon: Users },
] as const

type TabKey = typeof TABS[number]['key']

export default function ConnexInsidePage() {
  const [tab, setTab] = useState<TabKey>('revenue')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/hub"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับไปหน้าเลือกระบบ</span>
          </Link>
        </div>
      </header>

      <div className="page-container max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0">
            <LineChart className="w-5 h-5" />
          </div>
          <div>
            <h1>CONNEX Inside</h1>
            <p className="text-xs text-gray-500">ภาพรวมข้อมูลองค์กร</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6 -mb-px">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 py-2.5 border-b-2 text-sm font-medium transition-colors ${
                    active
                      ? 'border-amber-600 text-amber-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>

        {tab === 'revenue' && <RevenueTab />}
        {tab === 'headcount' && <HeadcountPayrollTab />}
      </div>
    </div>
  )
}
