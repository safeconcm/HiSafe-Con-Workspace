'use client'
// src/app/(dashboard)/hr/reports/page.tsx
// HR Analytics Dashboard — Leave charts + Heatmap + Dept summary
import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import { cn, LEAVE_TYPE_LABEL, formatDays } from '@/utils'
import { Loader2, Download, TrendingUp, Users, CalendarDays, Clock, Wallet, Activity } from 'lucide-react'
import type { LeaveType } from '@/types/database'

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 })

const TH_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const LEAVE_COLORS: Record<string, string> = {
  annual:    '#378ADD',
  sick:      '#E24B4A',
  personal:  '#EF9F27',
  maternity: '#D4537E',
  other:     '#888780',
}

// Heat intensity colors (0 = no leave, high = many days)
function heatColor(days: number): string {
  if (days === 0)  return 'var(--surface-1)'
  if (days <= 1)   return '#DBEAFE'
  if (days <= 3)   return '#93C5FD'
  if (days <= 5)   return '#3B82F6'
  if (days <= 8)   return '#1D4ED8'
  return '#1E3A8A'
}
function heatText(days: number): string {
  if (days === 0)  return 'transparent'
  if (days <= 3)   return '#1E3A8A'
  return '#ffffff'
}

async function fetchReport(type: string, year: number) {
  const res  = await fetch(`/api/hr/reports?type=${type}&year=${year}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data?.data ?? []
}

async function fetchExecSummary(year: number) {
  const res  = await fetch(`/api/hr/reports?type=exec_summary&year=${year}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data ?? { data: [], headcount: 0 }
}

// Generic single-series monthly bar chart, used for the three executive
// KPI trends (labor cost / OT cost / sick rate) — same visual language as
// the leave/timesheet bar charts below, just one color instead of stacked.
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
            <span className="text-[9px] text-gray-400 truncate w-full text-center">
              {TH_MONTHS_SHORT[d.month - 1]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Simple bar chart component (no external lib needed)
function BarChart({ data, year }: { data: any[]; year: number }) {
  const leaveTypes: LeaveType[] = ['annual', 'sick', 'personal', 'maternity', 'other']
  const maxVal = Math.max(...data.map(d => d.total ?? 0), 1)

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {leaveTypes.map(lt => (
          <div key={lt} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: LEAVE_COLORS[lt] }} />
            {LEAVE_TYPE_LABEL[lt]}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5 h-40">
        {data.map(d => (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            {/* Stacked bar */}
            <div className="w-full flex flex-col-reverse justify-end" style={{ height: '120px' }}>
              {leaveTypes.map(lt => {
                const val = d[lt] ?? 0
                if (!val) return null
                const h = (val / maxVal) * 120
                return (
                  <div
                    key={lt}
                    title={`${LEAVE_TYPE_LABEL[lt]}: ${val} วัน`}
                    style={{ height: `${h}px`, background: LEAVE_COLORS[lt], minHeight: val ? '2px' : '0' }}
                    className="w-full rounded-sm transition-all"
                  />
                )
              })}
            </div>
            <span className="text-[9px] text-gray-400 truncate w-full text-center">
              {TH_MONTHS_SHORT[d.month - 1]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Leave heatmap
function LeaveHeatmap({ data }: { data: any[] }) {
  const [dept, setDept]   = useState('')
  const depts = Array.from(new Set(data.map(d => d.dept))).filter(Boolean)
  const filtered = dept ? data.filter(d => d.dept === dept) : data

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select value={dept} onChange={e => setDept(e.target.value)} className="form-input w-auto text-sm">
          <option value="">ทุกแผนก</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} คน</span>
        {/* Legend */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-gray-400">น้อย</span>
          {[0,1,3,5,8,10].map(v => (
            <div key={v} className="w-4 h-4 rounded-sm border border-gray-200"
              style={{ background: heatColor(v) }} />
          ))}
          <span className="text-xs text-gray-400">มาก</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: '500px' }}>
          <thead>
            <tr>
              <th className="text-left py-1 px-2 text-gray-500 font-medium w-36">พนักงาน</th>
              <th className="text-left py-1 px-1 text-gray-400 font-normal w-20">แผนก</th>
              {TH_MONTHS_SHORT.map(m => (
                <th key={m} className="text-center py-1 px-0.5 text-gray-400 font-normal">{m}</th>
              ))}
              <th className="text-center py-1 px-2 text-gray-500 font-medium">รวม</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 20).map(u => {
              const total = u.months.reduce((s: number, v: number) => s + v, 0)
              return (
                <tr key={u.user_id} className="border-t border-gray-100">
                  <td className="py-1 px-2 font-medium text-gray-800 truncate max-w-[140px]">{u.name}</td>
                  <td className="py-1 px-1 text-gray-400 truncate max-w-[80px]">{u.dept}</td>
                  {u.months.map((days: number, i: number) => (
                    <td key={i} className="py-0.5 px-0.5 text-center">
                      <div
                        className="w-full rounded-sm mx-auto flex items-center justify-center"
                        style={{
                          height: '20px',
                          background: heatColor(days),
                          color: heatText(days),
                          fontSize: '9px',
                          fontWeight: days > 0 ? 500 : 400,
                        }}
                      >
                        {days > 0 ? days : ''}
                      </div>
                    </td>
                  ))}
                  <td className="py-1 px-2 text-center font-semibold text-gray-900">{total}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={15} className="text-center py-6 text-gray-400">ไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Department bar chart
function DeptChart({ data }: { data: any[] }) {
  const maxVal = Math.max(...data.map(d => d.total ?? 0), 1)
  return (
    <div className="space-y-2">
      {data.slice(0, 10).map(d => (
        <div key={d.dept}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-700 font-medium truncate">{d.dept}</span>
            <span className="text-gray-500 ml-2">{d.total} วัน</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {(['annual','sick','personal','maternity','other'] as LeaveType[]).map(lt => {
              const val = d[lt] ?? 0
              const pct = (val / maxVal) * 100
              return pct > 0 ? (
                <div
                  key={lt}
                  title={`${LEAVE_TYPE_LABEL[lt]}: ${val} วัน`}
                  style={{ width: `${pct}%`, background: LEAVE_COLORS[lt] }}
                  className="h-full transition-all"
                />
              ) : null
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Timesheet line chart (simple)
function TimesheetChart({ data }: { data: any[] }) {
  const maxHrs = Math.max(...data.map(d => d.total_hours ?? 0), 1)
  return (
    <div>
      <div className="flex items-end gap-1.5 h-32 mb-2">
        {data.map(d => (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full bg-purple-100 rounded-sm relative" style={{ height: '100px' }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-purple-500 rounded-sm transition-all"
                style={{ height: `${(d.total_hours / maxHrs) * 100}%` }}
                title={`${d.total_hours} ชม. / ${d.employee_count} คน`}
              />
            </div>
            <span className="text-[9px] text-gray-400">{TH_MONTHS_SHORT[d.month - 1]}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>รวมชั่วโมงต่อเดือน (Approved)</span>
        <span>รวม {data.reduce((s, d) => s + d.total_hours, 0).toLocaleString()} ชม.</span>
      </div>
    </div>
  )
}

export default function HRReportsPage() {
  const now  = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const { data: leaveData,   isLoading: l1 } = useQuery({ queryKey: ['report-leave',   year], queryFn: () => fetchReport('leave_summary',     year) })
  const { data: heatmapData, isLoading: l2 } = useQuery({ queryKey: ['report-heatmap', year], queryFn: () => fetchReport('heatmap',           year) })
  const { data: deptData,    isLoading: l3 } = useQuery({ queryKey: ['report-dept',    year], queryFn: () => fetchReport('dept_summary',       year) })
  const { data: tsData,      isLoading: l4 } = useQuery({ queryKey: ['report-ts',      year], queryFn: () => fetchReport('timesheet_summary',  year) })
  const { data: execData,    isLoading: l5 } = useQuery({ queryKey: ['report-exec',    year], queryFn: () => fetchExecSummary(year) })

  const isLoading = l1 || l2 || l3 || l4 || l5
  const execMonths: any[] = execData?.data ?? []
  // Most recent month that has any labor-cost data (falls back to current
  // month) — used for the 3 KPI cards up top.
  const latestExec = [...execMonths].reverse().find(m => m.labor_total_cost > 0 || m.ot_cost > 0 || m.sick_days > 0)
    ?? execMonths[now.getMonth()] ?? execMonths[execMonths.length - 1]

  const handleExport = () => {
    window.open(`/api/hr/leave/export?year=${year}&format=excel`, '_blank')
  }

  return (
    <div className="page-container space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-500" />
          <h1>รายงาน HR</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="form-input w-auto">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />Export
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-5">

          {/* Executive summary — consolidates payroll/leave/OT into one view */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2.5">สรุปภาพรวมสำหรับผู้บริหาร</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
                  ค่า OT รวม {latestExec ? `เดือน ${TH_MONTHS_SHORT[latestExec.month - 1]}` : ''} (ประมาณการ)
                </p>
              </div>
              <div className="card p-4">
                <div className="inline-flex p-2 rounded-lg mb-2 bg-blue-50">
                  <Wallet className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{latestExec ? THB.format(latestExec.labor_total_cost) : '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  ต้นทุนแรงงานรวม {latestExec ? `เดือน ${TH_MONTHS_SHORT[latestExec.month - 1]}` : ''} (ค่าแรง + OT)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="card">
                <div className="card-header">
                  <h3 className="text-sm font-medium text-gray-700">เทรนด์ต้นทุนแรงงานรวมรายเดือน ปี {year}</h3>
                </div>
                <div className="card-body">
                  {execMonths.some(m => m.labor_total_cost > 0)
                    ? <MetricBarChart data={execMonths} dataKey="labor_total_cost" color="#1D4ED8" format={v => THB.format(v)} />
                    : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <h3 className="text-sm font-medium text-gray-700">ค่า OT รวมรายเดือน ปี {year}</h3>
                </div>
                <div className="card-body">
                  {execMonths.some(m => m.ot_cost > 0)
                    ? <MetricBarChart data={execMonths} dataKey="ot_cost" color="#D97706" format={v => THB.format(v)} />
                    : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <h3 className="text-sm font-medium text-gray-700">อัตราการลาป่วยรายเดือน ปี {year}</h3>
                </div>
                <div className="card-body">
                  {execMonths.some(m => m.sick_rate_pct > 0)
                    ? <MetricBarChart data={execMonths} dataKey="sick_rate_pct" color="#DC2626" format={v => `${v}%`} />
                    : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ค่า OT เป็นตัวเลขประมาณการ (อัตราจ่าย 1.5 เท่าสำหรับ OT วันทำงาน และ 3 เท่าสำหรับวันหยุด/นักขัตฤกษ์ คูณกับค่าแรงต่อชั่วโมงของพนักงาน)
              ต้นทุนแรงงานรวม = ค่าแรงจาก Timesheet ที่อนุมัติแล้ว + ค่า OT ประมาณการ ·
              อัตราการลาป่วย = วันลาป่วยที่อนุมัติ ÷ (จำนวนพนักงาน active × วันทำงานในเดือน) × 100
            </p>
          </div>

          {/* Row 1: Leave bar + Timesheet bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <div className="card-header flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-700">วันลาอนุมัติรายเดือน ปี {year}</h3>
              </div>
              <div className="card-body">
                {leaveData?.length ? <BarChart data={leaveData} year={year} /> : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
              </div>
            </div>
            <div className="card">
              <div className="card-header flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-700">ชั่วโมง Timesheet รายเดือน ปี {year}</h3>
              </div>
              <div className="card-body">
                {tsData?.length ? <TimesheetChart data={tsData} /> : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
              </div>
            </div>
          </div>

          {/* Row 2: Dept summary */}
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-700">วันลาตามแผนก ปี {year}</h3>
            </div>
            <div className="card-body">
              {deptData?.length ? <DeptChart data={deptData} /> : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
            </div>
          </div>

          {/* Row 3: Heatmap */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-sm font-medium text-gray-700">Leave Heatmap — วันลาของพนักงานรายบุคคล ปี {year}</h3>
              <p className="text-xs text-gray-400 mt-0.5">สีเข้ม = ลาหลายวัน · แสดงสูงสุด 20 คน</p>
            </div>
            <div className="card-body overflow-x-auto">
              {heatmapData?.length
                ? <LeaveHeatmap data={heatmapData} />
                : <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูล</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
