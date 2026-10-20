'use client'
// src/app/(dashboard)/payroll/cost-centers/page.tsx
// Cost Centers — hours/cost grouped by the 11 Activity Codes (Section B of
// the official Timesheet form), summed across every Job and every employee.
// 2026-10-20, per request: "Time sheet ช่องให้เลือก Activity code ... ให้ดึง
// ข้อมูลไปสร้าง Tab ... Cost Centers จัดแยกรวมกรองตาม Cost Centers ทั้ง 11
// รูป ที่บันทึกเชื่อมโยงมาจาก Time sheet", then moved here 2026-10-20 (same
// day, follow-up: "แต่ถ้าย้าย Cost Centers ให้ HR ดู Tab HR ได้ไหม เพราะ
// พวก Payroll job cost จะอยู่ด้วยกัน") — originally built as its own tab
// under CONNEX Access (/access/cost-centers), moved here to sit next to its
// closest relative, "ต้นทุนแรงงานตาม Job (Job Cost)" (src/app/(dashboard)/
// payroll/page.tsx), inside the HR dropdown (see Sidebar.tsx) instead of
// living in a separate module. CONNEX Access no longer has a Cost Centers
// tab or an HR-reachable page at all — it's back to Admin-only.
//
// Sibling, not a clone: mirrors payroll/page.tsx's "ตาม Job" view (same
// month/year cycle toggle, same CSV download pattern) — this is the same
// report shape, just grouped by Activity Code instead of Job Code, with
// each code's row expandable to show which Jobs its hours came from
// (reusing the Fragment-per-group pattern from src/app/access/jobs/page.tsx).
//
// No middleware route guard for this path, same as payroll/page.tsx itself
// (see that file — /payroll isn't in src/middleware.ts's ROLE_ROUTES
// either): access control lives entirely in /api/cost-centers's own role
// check (['hr','admin']), the same convention already established by
// /api/payroll. Anyone not hr/admin who navigates here directly sees the
// API's error message rendered in the red error box below, not a redirect.
import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Download, Loader2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/utils'

const MONTH_LABEL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// Mirrors cyclePeriod() in src/lib/payroll.ts — client-side only, for
// display (see payroll/page.tsx's identical helper for why this isn't
// imported from payroll.ts, which pulls in server-only Supabase code).
function cycleDateRangeLabel(year: number, month: number): string {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  return `26 ${MONTH_LABEL[prevMonth]} ${prevYear + 543} – 25 ${MONTH_LABEL[month]} ${year + 543}`
}

type Period = 'month' | 'year'

export default function CostCentersPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [period, setPeriod] = useState<Period>('month')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const apiUrl = `/api/cost-centers?year=${year}${period === 'year' ? '&period=year' : `&month=${month}`}`

  const { data, isLoading, error } = useQuery({
    queryKey: ['cost-centers', period, year, month],
    queryFn: async () => {
      const res  = await fetch(apiUrl)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลไม่สำเร็จ')
      return json.data
    },
  })

  const rows = data?.rows ?? []
  const grandTotalHours = rows.reduce((s: number, r: any) => s + r.hours, 0)
  const grandTotalCost  = rows.reduce((s: number, r: any) => s + r.cost, 0)

  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ } else if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y)
  }
  const shiftYear = (delta: number) => setYear(y => y + delta)

  const toggleRow = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-gray-500" />
          <h1>Cost Centers (ตาม Activity Code)</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {period === 'month' ? (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <button onClick={() => shiftMonth(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-gray-700 w-24 text-center">{MONTH_LABEL[month]} {year + 543}</span>
              <button onClick={() => shiftMonth(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <button onClick={() => shiftYear(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-gray-700 w-20 text-center">ปี {year + 543}</span>
              <button onClick={() => shiftYear(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          <a href={`${apiUrl}&format=csv`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />CSV
          </a>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {([['month', 'รายเดือน'], ['year', 'รายปี']] as [Period, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setPeriod(v)}
              className={cn('px-3 py-1.5 rounded-md text-sm transition-colors',
                period === v ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {period === 'month' && (
        <p className="text-xs text-gray-400">รอบที่แสดง: {cycleDateRangeLabel(year, month)}</p>
      )}

      <p className="text-sm text-gray-500">
        คำนวณจาก Timesheet ที่อนุมัติแล้วเท่านั้น จัดกลุ่มตาม Activity Code (11 รหัสจาก Section B ของแบบฟอร์ม Timesheet ทางการ) แทนที่จะเป็นตาม Job Code —
        คลิกแต่ละแถวเพื่อดูว่าชั่วโมง/ต้นทุนมาจาก Job ใดบ้าง
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        แถว &quot;ยังไม่ระบุ Activity Code&quot; คือชั่วโมงงานที่พนักงานยังไม่ได้เลือก Activity Code ตอนกรอก Timesheet —
        ไปที่หน้า Timesheet แล้วเลือก Activity Code ให้ครบเพื่อให้ตัวเลขถูกจัดกลุ่มได้ถูกต้อง
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{(error as Error).message}</div>
      ) : (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Activity Code</th><th>ชื่อกิจกรรม</th>
                  <th className="text-right">จำนวนพนักงาน</th>
                  <th className="text-right">ชั่วโมงรวม</th>
                  <th className="text-right">ต้นทุนรวม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const isOpen = expanded.has(r.activity_code)
                  const isUnclassified = r.activity_code === 'unclassified'
                  return (
                    <Fragment key={r.activity_code}>
                      <tr
                        onClick={() => toggleRow(r.activity_code)}
                        className={cn('cursor-pointer hover:bg-gray-50', isUnclassified && 'bg-amber-50/60')}
                      >
                        <td>
                          {isOpen
                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                            : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </td>
                        <td className="font-mono text-xs">{isUnclassified ? '-' : r.activity_code}</td>
                        <td className={cn('text-sm', isUnclassified ? 'text-amber-700' : 'text-gray-700')}>{r.activity_label}</td>
                        <td className="text-right text-sm text-gray-600">{r.employee_count}</td>
                        <td className="text-right text-sm text-gray-600">{r.hours}</td>
                        <td className="text-right text-sm font-medium text-gray-900">{r.cost.toLocaleString('th-TH')} ฿</td>
                      </tr>
                      {isOpen && r.jobs.map((j: any, i: number) => (
                        <tr key={i} className="bg-gray-50/70">
                          <td></td>
                          <td className="font-mono text-xs text-gray-500 pl-4">{j.job_code}</td>
                          <td className="text-sm text-gray-600">{j.job_name}</td>
                          <td></td>
                          <td className="text-right text-xs text-gray-500">{j.hours}</td>
                          <td className="text-right text-xs text-gray-500">{j.cost.toLocaleString('th-TH')} ฿</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
                {!rows.length && (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                    ไม่มี Timesheet ที่อนุมัติแล้วสำหรับ{period === 'year' ? `ปี ${year + 543}` : 'เดือนนี้'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!!rows.length && (
            <div className="card card-body flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                รวมทั้งหมด{period === 'year' ? ` (ปี ${year + 543})` : ''} · {grandTotalHours} ชั่วโมง
              </span>
              <span className="text-base font-semibold text-gray-900">{grandTotalCost.toLocaleString('th-TH')} ฿</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
