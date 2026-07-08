'use client'
// src/app/(dashboard)/payroll/page.tsx
// Wage breakdown per employee per job code, computed from approved
// timesheets (see src/lib/payroll.ts for the formula). Visible to
// supervisor/hr/admin — placed at a top-level route (not /hr/payroll)
// so the middleware's /hr role gate doesn't block supervisors/MD.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_LABEL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export default function PayrollPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll', year, month],
    queryFn: async () => {
      const res  = await fetch(`/api/payroll?year=${year}&month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลไม่สำเร็จ')
      return json.data
    },
  })

  const rows = data?.rows ?? []
  const grandTotal = rows.reduce((s: number, r: any) => s + r.net_pay, 0)

  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ } else if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-gray-500" />
          <h1>ค่าแรงจาก Timesheet</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => shiftMonth(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-gray-700 w-24 text-center">{MONTH_LABEL[month]} {year + 543}</span>
            <button onClick={() => shiftMonth(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <a href={`/api/payroll?year=${year}&month=${month}&format=csv`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />CSV
          </a>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        คำนวณจาก Timesheet ที่อนุมัติแล้วเท่านั้น — ค่าแรง/วัน = เงินเดือน ÷ วันทำงานของเดือนนั้น (หักวันอาทิตย์) ยังไม่รวมวันหยุดเสาร์เฉพาะของแต่ละบริษัท
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{(error as Error).message}</div>
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
