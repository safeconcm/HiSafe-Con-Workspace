'use client'
// src/app/(dashboard)/dashboard/executive/page.tsx
// MD dashboard (2026-10-20, "ข้อ 1") — read-only company-wide summary for
// whoever sits at the root of the org tree (session.is_org_root, see
// Sidebar.tsx / api-helpers.ts isOrgRoot()). Reuses the exec_summary report
// type already built for /hr/reports (aggregate-only: sick rate %, OT cost,
// labor cost, headcount — no employee names), now also opened to org-root
// sessions on the API side (see /api/hr/reports/route.ts). No edit/approve
// actions anywhere on this page — pure overview.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Gauge, Activity, Clock, Wallet, Users } from 'lucide-react'

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 })
const TH_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

async function fetchExecSummary(year: number) {
  const res  = await fetch(`/api/hr/reports?type=exec_summary&year=${year}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data ?? { data: [], headcount: 0 }
}

function MetricBarChart({
  data, dataKey, color, format,
}: { data: any[]; dataKey: string; color: string; format: (v: number) => string }) {
  const maxVal = Math.max(...data.map(d => d[dataKey] ?? 0), 1)
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map(d => {
        const val = d[dataKey] ?? 0
        const h = maxVal > 0 ? (val / maxVal) * 88 : 0
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <div className="w-full flex flex-col justify-end" style={{ height: '88px' }}>
              <div
                title={`${TH_MONTHS_SHORT[d.month - 1]}: ${format(val)}`}
                style={{ height: `${h}px`, background: color, minHeight: val ? '2px' : '0' }}
                className="w-full rounded-sm transition-all"
              />
            </div>
            <span className="text-[9px] text-gray-400 truncate w-full text-center">{TH_MONTHS_SHORT[d.month - 1]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ExecutiveDashboardPage() {
  const now  = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const { data: execData, isLoading, isError } = useQuery({
    queryKey: ['exec-dashboard', year],
    queryFn: () => fetchExecSummary(year),
  })

  const execMonths: any[] = execData?.data ?? []
  const headcount = execData?.headcount ?? 0
  const latestExec = [...execMonths].reverse().find(m => m.labor_total_cost > 0 || m.ot_cost > 0 || m.sick_days > 0)
    ?? execMonths[now.getMonth()] ?? execMonths[execMonths.length - 1]

  return (
    <div className="page-container space-y-6">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-gray-500" />
          <h1>ภาพรวมผู้บริหาร</h1>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="form-input w-auto">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : isError ? (
        <div className="card p-6 text-center text-sm text-gray-400">
          ไม่สามารถโหลดข้อมูลได้ — หน้านี้สำหรับผู้ที่อยู่บนสุดของโครงสร้างองค์กรเท่านั้น
        </div>
      ) : (
        <div className="space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="inline-flex p-2 rounded-lg mb-2 bg-indigo-50">
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{headcount}</p>
              <p className="text-xs text-gray-500 mt-0.5">พนักงานทั้งหมด (active)</p>
            </div>
            <div className="card p-4">
              <div className="inline-flex p-2 rounded-lg mb-2 bg-red-50">
                <Activity className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{latestExec ? `${latestExec.sick_rate_pct}%` : '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                อัตราการลาป่วย {latestExec ? `เดือน ${TH_MONTHS_SHORT[latestExec.month - 1]}` : ''}
              </p>
            </div>
            <div className="card p-4">
              <div className="inline-flex p-2 rounded-lg mb-2 bg-amber-50">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{latestExec ? THB.format(latestExec.ot_cost) : '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                ค่า OT (ประมาณการ) {latestExec ? `เดือน ${TH_MONTHS_SHORT[latestExec.month - 1]}` : ''}
              </p>
            </div>
            <div className="card p-4">
              <div className="inline-flex p-2 rounded-lg mb-2 bg-blue-50">
                <Wallet className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{latestExec ? THB.format(latestExec.labor_total_cost) : '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                ต้นทุนแรงงานรวม {latestExec ? `เดือน ${TH_MONTHS_SHORT[latestExec.month - 1]}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="card">
              <div className="card-header"><h3 className="text-sm font-medium text-gray-700">เทรนด์ต้นทุนแรงงานรวมรายเดือน ปี {year}</h3></div>
              <div className="card-body">
                {execMonths.some(m => m.labor_total_cost > 0)
                  ? <MetricBarChart data={execMonths} dataKey="labor_total_cost" color="#1D4ED8" format={v => THB.format(v)} />
                  : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="text-sm font-medium text-gray-700">ค่า OT รวมรายเดือน ปี {year}</h3></div>
              <div className="card-body">
                {execMonths.some(m => m.ot_cost > 0)
                  ? <MetricBarChart data={execMonths} dataKey="ot_cost" color="#D97706" format={v => THB.format(v)} />
                  : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="text-sm font-medium text-gray-700">อัตราการลาป่วยรายเดือน ปี {year}</h3></div>
              <div className="card-body">
                {execMonths.some(m => m.sick_rate_pct > 0)
                  ? <MetricBarChart data={execMonths} dataKey="sick_rate_pct" color="#DC2626" format={v => `${v}%`} />
                  : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            ค่า OT เป็นตัวเลขประมาณการ (อัตราจ่าย 1.5 เท่าสำหรับ OT วันทำงาน และ 3 เท่าสำหรับวันหยุด/นักขัตฤกษ์ คูณกับค่าแรงต่อชั่วโมงของพนักงาน) ·
            ต้นทุนแรงงานรวม = ค่าแรงจาก Timesheet ที่อนุมัติแล้ว + ค่า OT ประมาณการ ·
            อัตราการลาป่วย = วันลาป่วยที่อนุมัติ ÷ (จำนวนพนักงาน active × วันทำงานในเดือน) × 100 ·
            ข้อมูลเป็นแบบอ่านอย่างเดียว ไม่มีการอนุมัติ/แก้ไขจากหน้านี้
          </p>
        </div>
      )}
    </div>
  )
}
