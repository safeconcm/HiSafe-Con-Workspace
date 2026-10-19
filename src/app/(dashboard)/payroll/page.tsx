'use client'
// src/app/(dashboard)/payroll/page.tsx
// Job Direct Cost (2026-10-16, renamed per request: "ค่าแรง/payroll ต้อง
// เป็น Job Direct Cost summary รายเดือน รายปี ตาม Job ควรอยู่ใน Tab HR") —
// labor cost allocated to each Job Code, computed from approved Timesheets
// (see src/lib/payroll.ts). This is a cost-allocation report for
// project/job accounting, NOT actual payroll — what each person is really
// paid (with deductions, notes, etc.) now lives at the separate
// /hr/payroll-salary ("Payroll พนักงานประจำ (Staff)") page, since Staff who
// don't track hours against Job Codes never showed up here at all. Moved
// out of the flat top-level sidebar nav into the HR dropdown (see
// Sidebar.tsx) — this is an HR/management report, not a page most people
// need.
//
// Default view is now "ตาม Job" (cost per Job Code, summed across every
// employee) rather than the original "ตามพนักงาน" (cost per employee,
// broken into their jobs) — the by-Job view is what project/job costing
// actually needs; the by-employee view is kept as a secondary toggle since
// it's still useful for checking an individual's Timesheet-derived cost.
// Both support a รายเดือน/รายปี period toggle for the by-Job view (the
// by-employee view stays month-only, matching its original behavior).

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils'

const MONTH_LABEL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// Mirrors cyclePeriod() in src/lib/payroll.ts (26th of the previous month
// through the 25th of this one) — client-side only for display, so the
// month label ("ต.ค. 2569") doesn't read as a plain calendar month when
// groupBy is 'job'. Not imported from payroll.ts since that module pulls in
// server-only Supabase client code.
function cycleDateRangeLabel(year: number, month: number): string {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  return `26 ${MONTH_LABEL[prevMonth]} ${prevYear + 543} – 25 ${MONTH_LABEL[month]} ${year + 543}`
}

type GroupBy = 'job' | 'employee'
type Period  = 'month' | 'year'

export default function PayrollPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [groupBy, setGroupBy] = useState<GroupBy>('job')
  const [period,  setPeriod]  = useState<Period>('month')

  // The by-employee view only ever existed as a month-at-a-time breakdown —
  // switching to it falls back to month, rather than silently ignoring an
  // active "year" selection.
  const effectivePeriod: Period = groupBy === 'employee' ? 'month' : period

  const apiUrl = groupBy === 'job'
    ? `/api/payroll?group=job&year=${year}${effectivePeriod === 'year' ? '&period=year' : `&month=${month}`}`
    : `/api/payroll?year=${year}&month=${month}`

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll', groupBy, effectivePeriod, year, month],
    queryFn: async () => {
      const res  = await fetch(apiUrl)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลไม่สำเร็จ')
      return json.data
    },
  })

  const rows = data?.rows ?? []
  const grandTotal = groupBy === 'job'
    ? rows.reduce((s: number, r: any) => s + r.cost, 0)
    : rows.reduce((s: number, r: any) => s + r.net_pay, 0)

  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ } else if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y)
  }
  const shiftYear = (delta: number) => setYear(y => y + delta)

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-gray-500" />
          <h1>ต้นทุนแรงงานตาม Job (Job Direct Cost)</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {effectivePeriod === 'month' ? (
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
          {([['job', 'ตาม Job'], ['employee', 'ตามพนักงาน']] as [GroupBy, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setGroupBy(v)}
              className={cn('px-3 py-1.5 rounded-md text-sm transition-colors',
                groupBy === v ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
            >
              {l}
            </button>
          ))}
        </div>
        {groupBy === 'job' && (
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
        )}
      </div>

      {groupBy === 'job' && effectivePeriod === 'month' && (
        <p className="text-xs text-gray-400">รอบที่แสดง: {cycleDateRangeLabel(year, month)}</p>
      )}

      <p className="text-sm text-gray-500">
        {groupBy === 'job'
          // 2026-10-19: ตาม Job คิดตามรอบจ่ายจริงของบริษัท (26 เดือนก่อน–25
          // เดือนนี้) ไม่ใช่เดือนปฏิทิน — ดูที่มาใน src/lib/payroll.ts
          // (cyclePeriod, getUserRateForPeriod)
          ? 'คำนวณจาก Timesheet ที่อนุมัติแล้วเท่านั้น — นับตามรอบจ่ายจริง 26 เดือนก่อน ถึง 25 เดือนนี้ (ไม่ใช่เดือนปฏิทิน) ค่าแรง/วัน = เงินเดือน ÷ วันทำงานจริงของรอบนั้นตามตารางทำงานของบริษัท'
          : 'คำนวณจาก Timesheet ที่อนุมัติแล้วเท่านั้น — ค่าแรง/วัน = เงินเดือน ÷ วันทำงานของเดือนปฏิทินนั้นตามตารางทำงานของบริษัท'}
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        หน้านี้ใช้คำนวณต้นทุนแรงงานลงแต่ละ Job Code (Job Cost) เท่านั้น ไม่ใช่ยอดจ่ายเงินเดือนจริง —
        สำหรับเงินเดือน Staff ที่จ่ายจริง ไปที่{' '}
        <a href="/hr/payroll-salary" className="underline font-medium">Payroll พนักงานประจำ (Staff)</a>
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{(error as Error).message}</div>
      ) : groupBy === 'job' ? (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job Code</th><th>ชื่องาน</th>
                  <th className="text-right">จำนวนพนักงาน</th>
                  <th className="text-right">ชั่วโมงรวม</th>
                  <th className="text-right">ต้นทุนรวม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j: any, i: number) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{j.job_code}</td>
                    <td className="text-sm text-gray-700">{j.job_name}</td>
                    <td className="text-right text-sm text-gray-600">{j.employee_count}</td>
                    <td className="text-right text-sm text-gray-600">{j.hours}</td>
                    <td className="text-right text-sm font-medium text-gray-900">{j.cost.toLocaleString('th-TH')} ฿</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                    ไม่มี Timesheet ที่อนุมัติแล้วสำหรับ{effectivePeriod === 'year' ? `ปี ${year + 543}` : 'เดือนนี้'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!!rows.length && (
            <div className="card card-body flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                รวมต้นทุนแรงงานทั้งหมด{effectivePeriod === 'year' ? ` (ปี ${year + 543})` : ''}
              </span>
              <span className="text-base font-semibold text-gray-900">{grandTotal.toLocaleString('th-TH')} ฿</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r: any) => (
            <div key={r.user_id} className="card overflow-hidden">
              <div className="card-header flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.employee_code} · {r.department ?? '-'} · อัตรา {r.hourly_rate.toLocaleString('th-TH')} บาท/ชม.</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{r.net_pay.toLocaleString('th-TH')} ฿</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Job Code</th><th>ชื่องาน</th><th className="text-right">ชั่วโมง</th><th className="text-right">ค่าแรง</th></tr>
                </thead>
                <tbody>
                  {r.jobs.map((j: any, i: number) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{j.job_code}</td>
                      <td className="text-sm text-gray-600">{j.job_name}</td>
                      <td className="text-right text-sm text-gray-600">{j.hours}</td>
                      <td className="text-right text-sm text-gray-900">{j.cost.toLocaleString('th-TH')} ฿</td>
                    </tr>
                  ))}
                  {r.unpaid_leave_days > 0 && (
                    <tr className="bg-red-50">
                      <td className="font-mono text-xs">-</td>
                      <td className="text-sm text-red-600">หักลา {r.unpaid_leave_days} วัน (ทดลองงาน ไม่มีสิทธิ์รับค่าจ้าง)</td>
                      <td className="text-right text-sm text-red-600">{r.unpaid_leave_days * 8}</td>
                      <td className="text-right text-sm text-red-600">-{r.unpaid_deduction.toLocaleString('th-TH')} ฿</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
          {!rows.length && (
            <div className="card card-body text-center py-10 text-gray-400 text-sm">
              ไม่มี Timesheet ที่อนุมัติแล้วสำหรับเดือนนี้
            </div>
          )}
          {!!rows.length && (
            <div className="card card-body flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">รวมค่าแรงทั้งหมด</span>
              <span className="text-base font-semibold text-gray-900">{grandTotal.toLocaleString('th-TH')} ฿</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
