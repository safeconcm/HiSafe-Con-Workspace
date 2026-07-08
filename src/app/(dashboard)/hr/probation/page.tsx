'use client'
// src/app/(dashboard)/hr/probation/page.tsx
// List employees currently on probation, sorted by soonest end-date first.
// Uses the existing GET /api/hr/contracts?status=active endpoint and filters
// client-side for probation_status = 'pending' (still unresolved).

import { useQuery } from '@tanstack/react-query'
import { cn, fullNameTH } from '@/utils'
import { ClipboardCheck, Loader2, ChevronRight, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

function daysLeft(dateStr: string): number {
  const end = new Date(dateStr)
  const today = new Date()
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

export default function ProbationPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['probation-contracts'],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/contracts?status=active&limit=200`)
      const json = await res.json()
      return json.data
    },
  })

  const contracts = ((data?.contracts ?? []) as any[])
    .filter(c => c.probation_status === 'pending' && c.probation_end)
    .sort((a, b) => new Date(a.probation_end).getTime() - new Date(b.probation_end).getTime())

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-gray-500" />
        <h1>พนักงานทดลองงาน</h1>
      </div>
      <p className="text-sm text-gray-500">
        รายชื่อพนักงานที่ยังอยู่ในช่วงทดลองงาน (ยังไม่สรุปผล) เรียงตามวันครบกำหนดใกล้สุดก่อน
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>ตำแหน่ง</th>
                <th>วันเริ่มงาน</th>
                <th>ครบกำหนดทดลองงาน</th>
                <th>เหลือเวลา</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c: any) => {
                const left = daysLeft(c.probation_end)
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium shrink-0">
                          {c.user?.first_name_th?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{fullNameTH(c.user)}</p>
                          <p className="text-xs text-gray-400">{c.user?.employee_code} · {c.user?.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-gray-600">{c.position_th}</td>
                    <td className="text-sm text-gray-600 whitespace-nowrap">{c.start_date}</td>
                    <td className="text-sm text-gray-600 whitespace-nowrap">{c.probation_end}</td>
                    <td>
                      <span className={cn('badge',
                        left <= 0 ? 'bg-red-100 text-red-700'
                        : left <= 7 ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600')}>
                        {left <= 0 && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {left <= 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : `เหลือ ${left} วัน`}
                      </span>
                    </td>
                    <td>
                      <Link href={`/hr/probation/${c.id}`} className="text-gray-400 hover:text-gray-700">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {!contracts.length && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">ไม่มีพนักงานทดลองงานที่ยังไม่สรุปผล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
