'use client'
// src/app/inside/JobCodesTab.tsx
// CONNEX Inside — "Job Codes" tab (2026-11-02, "เอา Job codes มาอยู่ใน
// CONNEX Inside ด้วย และเพิ่มการคิดค่าใช่จ่ายค่าแรง staff ตาม Job ด้วย").
// Read-only overview of every Job Code (reuses /api/admin/jobs — same data
// as CONNEX Access' Jobs page, so figures can never disagree) plus a new
// "ต้นทุนแรงงานสะสม" (life-to-date Staff labor cost) column computed from
// every approved Timesheet ever logged against that Job
// (/api/admin/jobs/labor-cost → computeJobCostAllTime in src/lib/payroll.ts
// — same per-cycle rate math as the existing Job Direct Cost report, just
// summed across all cycles instead of one year). Margin (มูลค่างาน − ต้นทุน)
// is shown alongside since both figures are already on the row.
//
// 2026-11-02 follow-up ("ควรจะแยกรายปี รายลูกค้า รายที่เปิดใช้งาน และรายที่
// ปิดแล้ว"): added the same ปี/ลูกค้า grouping toggle as CONNEX Access' Jobs
// page (reusing groupJobs from src/lib/jobs-grouping.ts — same J-code year
// logic and group ordering, so this view is never out of sync with that
// one), plus a status filter (เปิดใช้งาน / ปิดแล้ว / ทั้งหมด). Each group
// shows its own subtotal (count, มูลค่างาน, ต้นทุนแรงงาน) alongside the
// grand total.
//
// Full management (add/edit/delete/import) stays at CONNEX Access → Job
// Codes, unchanged — this tab is read-only by design (see conversation).
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useJobs, useJobsLaborCostAllTime } from '@/hooks/useAdmin'
import { groupJobs, type JobGroupBy } from '@/lib/jobs-grouping'
import { JOB_STATUS_LABEL, cn } from '@/utils'
import type { JobStatus } from '@/types/database'
import { Briefcase, Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react'

function formatTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' ฿'
}

const STATUS_BADGE: Record<JobStatus, string> = {
  active:   'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-amber-50 text-amber-700 border-amber-200',
  closed:   'bg-gray-100 text-gray-500 border-gray-200',
}

type StatusFilter = 'all' | 'active' | 'closed'
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',    label: 'ทั้งหมด' },
  { key: 'active', label: 'เปิดใช้งาน' },
  { key: 'closed', label: 'ปิดแล้ว' },
]

export function JobCodesTab() {
  const [search,       setSearch]       = useState('')
  const [groupBy,       setGroupBy]       = useState<JobGroupBy>('year')
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all')
  const [collapsed,     setCollapsed]     = useState<Set<string>>(new Set())

  const { data: jobsData, isLoading: jobsLoading } = useJobs('all', 'all')
  const { data: costData, isLoading: costLoading } = useJobsLaborCostAllTime()

  const costByJobId = useMemo(() => {
    const m = new Map<string, { hours: number; cost: number }>()
    for (const r of costData?.rows ?? []) {
      if (r.job_id) m.set(r.job_id, { hours: r.hours, cost: r.cost })
    }
    return m
  }, [costData])

  const jobs: any[] = jobsData?.jobs ?? []

  const statusFiltered = statusFilter === 'all'
    ? jobs
    : jobs.filter(j => statusFilter === 'active' ? j.status !== 'closed' : j.status === 'closed')
  // "เปิดใช้งาน" includes both 'active' and 'inactive' (พักไว้ ≠ ปิด) — only
  // 'closed' is excluded, matching how CONNEX Access treats "active" status
  // changes (inactive is a temporary pause, closed is permanent — see
  // STATUS_WARNING in access/jobs/page.tsx).

  const q = search.trim().toLowerCase()
  const filtered = !q ? statusFiltered : statusFiltered.filter((j: any) =>
    [j.job_code, j.name_th, j.name_en, j.client_name].some((v: string | null) => (v ?? '').toLowerCase().includes(q))
  )

  const jobGroups = groupJobs(filtered, groupBy)
  const groupIds  = jobGroups.map(g => `${groupBy}:${g.key}`)
  const allCollapsed = groupIds.length > 0 && groupIds.every(id => collapsed.has(id))

  const toggleGroup = (groupId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })
  }
  const toggleAllGroups = () => {
    setCollapsed(prev => {
      const next = new Set(prev)
      groupIds.forEach(id => allCollapsed ? next.delete(id) : next.add(id))
      return next
    })
  }

  const isLoading = jobsLoading || costLoading

  const groupTotals = (list: any[]) => list.reduce((acc, j) => {
    const c = costByJobId.get(j.id)
    acc.value += j.contract_value ?? 0
    acc.cost  += c?.cost ?? 0
    return acc
  }, { value: 0, cost: 0 })

  const grandTotals = groupTotals(filtered)

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหา Job Code / ชื่องาน / ผู้ว่าจ้าง"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-9 w-full"
          />
        </div>
        <Link href="/access/jobs" className="text-xs text-blue-600 hover:underline">
          จัดการ Job Codes (เพิ่ม/แก้ไข/นำเข้า) ที่ CONNEX Access →
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {([['year', 'รายปี'], ['client', 'รายลูกค้า']] as [JobGroupBy, string][]).map(([v, l]) => (
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
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn('px-3 py-1.5 rounded-md text-sm transition-colors',
                statusFilter === key ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
            >
              {label}
            </button>
          ))}
        </div>
        {!!jobGroups.length && (
          <button onClick={toggleAllGroups} className="text-xs text-gray-500 hover:text-gray-700 underline ml-auto">
            {allCollapsed ? 'ขยายทั้งหมด' : 'ย่อทั้งหมด'}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {jobGroups.map(group => {
          const groupId = `${groupBy}:${group.key}`
          const isCollapsed = collapsed.has(groupId)
          const subtotal = groupTotals(group.jobs)
          return (
            <div key={group.key} className="card overflow-hidden">
              <button
                onClick={() => toggleGroup(groupId)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  {group.key} <span className="text-gray-400 font-normal">({group.jobs.length} Job)</span>
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-4">
                  <span>มูลค่างาน {formatTHB(subtotal.value)}</span>
                  <span>ต้นทุนแรงงาน {formatTHB(subtotal.cost)}</span>
                </span>
              </button>
              {!isCollapsed && (
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th>Job Code</th>
                      <th>ชื่องาน</th>
                      <th>ผู้ว่าจ้าง</th>
                      <th>สถานะ</th>
                      <th className="text-right">มูลค่างาน</th>
                      <th className="text-right">ต้นทุนแรงงานสะสม</th>
                      <th className="text-right">กำไรขั้นต้น (ประมาณการ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.jobs.map((j: any) => {
                      const c = costByJobId.get(j.id)
                      const cost = c?.cost ?? 0
                      const hasValue = j.contract_value !== null && j.contract_value !== undefined
                      const margin = hasValue ? j.contract_value - cost : null
                      return (
                        <tr key={j.id}>
                          <td className="font-mono text-xs">{j.job_code}</td>
                          <td className="text-gray-700">{j.name_th}</td>
                          <td className="text-gray-600">{j.client_name || '—'}</td>
                          <td>
                            <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs border', STATUS_BADGE[j.status as JobStatus])}>
                              {JOB_STATUS_LABEL[j.status as JobStatus] ?? j.status}
                            </span>
                          </td>
                          <td className="text-right text-gray-900">{hasValue ? formatTHB(j.contract_value) : '—'}</td>
                          <td className="text-right text-gray-900">{cost > 0 ? formatTHB(cost) : '—'}</td>
                          <td className={cn('text-right font-medium', margin !== null ? (margin >= 0 ? 'text-green-700' : 'text-red-600') : 'text-gray-300')}>
                            {margin !== null ? formatTHB(margin) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
        {!jobGroups.length && (
          <div className="card card-body text-center py-10 text-gray-400 text-sm">ไม่พบ Job Code</div>
        )}
      </div>

      {!!filtered.length && (
        <div className="card card-body flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-gray-400" />
            รวม {filtered.length} Job
          </span>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-600">มูลค่างานรวม <strong className="text-gray-900">{formatTHB(grandTotals.value)}</strong></span>
            <span className="text-gray-600">ต้นทุนแรงงานรวม <strong className="text-gray-900">{formatTHB(grandTotals.cost)}</strong></span>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        ต้นทุนแรงงานสะสม = ค่าแรง Staff ที่ลงเวลาใน Timesheet ที่อนุมัติแล้วทุกรอบจ่ายของ Job นี้ (สะสมตั้งแต่เริ่มใช้งานระบบ) ·
        กำไรขั้นต้นเป็นตัวเลขประมาณการจากมูลค่างานลบต้นทุนแรงงานเท่านั้น ไม่รวมต้นทุนวัสดุ/ผู้รับเหมาช่วง/ค่าใช้จ่ายอื่น ·
        "เปิดใช้งาน" รวม Job ที่พักไว้ชั่วคราวด้วย มีเฉพาะ "ปิดแล้ว" ที่แยกต่างหาก ·
        ข้อมูลของบริษัทที่กำลังใช้งานอยู่ (สลับบริษัทได้ที่หน้า Hub) · อ่านอย่างเดียว ไปจัดการ Job Codes ได้ที่ CONNEX Access
      </p>
    </div>
  )
}
