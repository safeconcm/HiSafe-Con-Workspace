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
// is shown alongside since both figures are already on the row — a natural,
// low-risk addition on top of what was asked for.
//
// Full management (add/edit/delete/import) stays at CONNEX Access → Job
// Codes, unchanged — this tab is read-only by design (see conversation).
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useJobs, useJobsLaborCostAllTime } from '@/hooks/useAdmin'
import { JOB_STATUS_LABEL, cn } from '@/utils'
import type { JobStatus } from '@/types/database'
import { Briefcase, Loader2, Search } from 'lucide-react'

function formatTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' ฿'
}

const STATUS_BADGE: Record<JobStatus, string> = {
  active:   'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-amber-50 text-amber-700 border-amber-200',
  closed:   'bg-gray-100 text-gray-500 border-gray-200',
}

export function JobCodesTab() {
  const [search, setSearch] = useState('')
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
  const filtered = search
    ? jobs.filter(j =>
        j.job_code.toLowerCase().includes(search.toLowerCase()) ||
        j.name_th?.toLowerCase().includes(search.toLowerCase()) ||
        j.client_name?.toLowerCase().includes(search.toLowerCase()))
    : jobs

  const isLoading = jobsLoading || costLoading

  const totals = filtered.reduce((acc, j) => {
    const c = costByJobId.get(j.id)
    acc.value += j.contract_value ?? 0
    acc.cost  += c?.cost ?? 0
    return acc
  }, { value: 0, cost: 0 })

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

      <div className="card overflow-hidden">
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
            {filtered.map((j: any) => {
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
            {!filtered.length && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">ไม่พบ Job Code</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!filtered.length && (
        <div className="card card-body flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-gray-400" />
            รวม {filtered.length} Job
          </span>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-600">มูลค่างานรวม <strong className="text-gray-900">{formatTHB(totals.value)}</strong></span>
            <span className="text-gray-600">ต้นทุนแรงงานรวม <strong className="text-gray-900">{formatTHB(totals.cost)}</strong></span>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        ต้นทุนแรงงานสะสม = ค่าแรง Staff ที่ลงเวลาใน Timesheet ที่อนุมัติแล้วทุกรอบจ่ายของ Job นี้ (สะสมตั้งแต่เริ่มใช้งานระบบ) ·
        กำไรขั้นต้นเป็นตัวเลขประมาณการจากมูลค่างานลบต้นทุนแรงงานเท่านั้น ไม่รวมต้นทุนวัสดุ/ผู้รับเหมาช่วง/ค่าใช้จ่ายอื่น ·
        ข้อมูลของบริษัทที่กำลังใช้งานอยู่ (สลับบริษัทได้ที่หน้า Hub) · อ่านอย่างเดียว ไปจัดการ Job Codes ได้ที่ CONNEX Access
      </p>
    </div>
  )
}
