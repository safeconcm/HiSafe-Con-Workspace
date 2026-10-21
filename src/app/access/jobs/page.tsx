'use client'
// src/app/access/jobs/page.tsx
// Moved here (2026-10-16) from src/app/(dashboard)/admin/jobs/page.tsx — see
// src/app/access/layout.tsx for context.
import { useState, Fragment } from 'react'
import Link                from 'next/link'
import * as XLSX            from 'xlsx'
import { useJobs, useCreateJob, useUpdateJob, useDeleteJob, useJobsRevenueSummary } from '@/hooks/useAdmin'
import { JOB_STATUS_LABEL, cn } from '@/utils'
import { groupJobs } from '@/lib/jobs-grouping'
import {
  Plus, Pencil, Trash2, Loader2, Briefcase, Upload, AlertTriangle, Search,
  ChevronDown, ChevronRight, Coins, FileDown, FileSpreadsheet, FileText,
} from 'lucide-react'
import type { JobStatus } from '@/types/database'

// มูลค่างาน formatting (2026-10-21) — plain Thai-locale grouping, no currency
// symbol clutter since every number on this page is already implicitly THB;
// "—" for null (not entered) so it reads differently from an actual ฿0.
function formatTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท'
}

// วันที่เริ่ม/สิ้นสุด (2026-10-21) — DB stores 'YYYY-MM-DD'; render as Thai
// Buddhist-era date (DD/MM/BBBB) to match the rest of the app's date style.
// Built from the raw string (not `new Date(iso)`) to dodge any UTC/local
// timezone shift on a date-only value.
function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  return `${d}/${mo}/${Number(y) + 543}`
}

const STATUS_COLOR: Record<JobStatus, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  closed:   'bg-red-100 text-red-600',
}

// Shown in the confirmation modal before switching a Job away from "active"
// (2026-10-20, "ข้อ 6") — explains the real, already-live downstream effect
// (timesheet entry + Job Cost both already filter on status='active', see
// src/app/api/timesheet/route.ts and src/lib/payroll.ts) so an admin isn't
// guessing what changing this dropdown actually does.
const STATUS_WARNING: Record<JobStatus, string | null> = {
  active:   null,
  inactive: 'พนักงานจะไม่สามารถเลือก Job นี้ในการลงเวลา (Timesheet) ใหม่ได้อีก แต่ข้อมูลเวลาที่ลงไว้แล้วยังคงอยู่ครบ และยังสลับกลับเป็น "กำลังดำเนินการ" ได้ทีหลัง',
  closed:   'โครงการนี้จะถูกปิดถาวร พนักงานจะไม่สามารถเลือก Job นี้ในการลงเวลาใหม่ได้อีก ข้อมูลเวลาและต้นทุนที่บันทึกไว้แล้วยังคงอยู่ครบและยังดูรายงานย้อนหลังได้ตามปกติ',
}

export default function AdminJobsPage() {
  const now  = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<any | null>(null)
  const [form,     setForm]     = useState({ job_code: '', name_th: '', name_en: '', client_name: '', description: '', contract_value: '', start_date: '', end_date: '', sequence_no: '' })
  // Pending status change awaiting confirmation (2026-10-20, "ข้อ 6") — null
  // when no confirmation modal is open.
  const [confirmChange, setConfirmChange] = useState<{ job: any; nextStatus: JobStatus } | null>(null)

  const { data, isLoading } = useJobs(year, 'all')
  const { data: revenue } = useJobsRevenueSummary()
  const createJob = useCreateJob()
  const updateJob = useUpdateJob()
  const deleteJob = useDeleteJob()
  // Job pending delete confirmation (2026-10-20, "ไม่มีปุ่มลบ") — the button
  // is always visible per row; this just holds which one the confirm modal
  // is for. The actual "can this really be deleted" check happens server-
  // side (DELETE /api/admin/jobs/:id) — if it's in use, the mutation's
  // onError toast shows the reason instead of silently doing nothing.
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)

  // Search (2026-10-20, "Job มันเยอะ พิมพ์แล้วเด้งขึ้น") — client-side,
  // instant-as-you-type, since the full year's Job list is already loaded.
  const [search, setSearch] = useState('')

  // Grouping dimension toggle + per-group collapse state (2026-10-20,
  // "สลับมุมมองได้ ปี ↔ ลูกค้า" + "ย่อทั้งหมดได้ในคลิกเดียว + คลิกทีละ
  // กลุ่ม" — both chosen via AskUserQuestion). collapsed holds composite IDs
  // ("year:J24", "client:ABC จำกัด") so switching groupBy never confuses a
  // stale collapsed id with a same-named group in the other mode.
  const [groupBy,   setGroupBy]   = useState<'year' | 'client'>('year')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const jobs = data?.jobs ?? []
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 1 - i)

  const q = search.trim().toLowerCase()
  const filteredJobs = !q ? jobs : jobs.filter((job: any) =>
    [job.job_code, job.name_th, job.name_en, job.client_name]
      .some((v: string | null) => (v ?? '').toLowerCase().includes(q))
  )

  // Group the (already search-filtered) list by the chosen dimension — logic
  // shared with the PDF export route (src/app/api/pdf/jobs/route.ts) via
  // src/lib/jobs-grouping.ts, so the printed PDF always matches this screen.
  const jobGroups = groupJobs(filteredJobs, groupBy)
  const groupMap  = new Map(jobGroups.map(g => [g.key, g.jobs]))
  const groupKeys = jobGroups.map(g => g.key)
  const groupIds  = groupKeys.map(k => `${groupBy}:${k}`)
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

  // Export (2026-10-21) — CSV/Excel share one flat row-builder: the exact
  // Jobs currently on screen, in the exact order they're grouped/sorted
  // into (jobGroups, computed above), with the group's own label repeated
  // on every row as a plain "กลุ่ม" column — flat formats have no good way
  // to show a nested sub-header, so this is the equivalent info per-row
  // instead of losing it.
  const EXPORT_COLS = ['ลำดับ', 'Job Code', 'ชื่องาน (ไทย)', 'ชื่องาน (อังกฤษ)', 'ลูกค้า', 'กลุ่ม', 'สถานะ', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'มูลค่างาน', 'รายละเอียด']
  const buildExportRows = (): (string | number)[][] => {
    const rows: (string | number)[][] = [EXPORT_COLS]
    for (const group of jobGroups) {
      for (const job of group.jobs) {
        rows.push([
          job.sequence_no ?? '',
          job.job_code,
          job.name_th,
          job.name_en ?? '',
          job.client_name ?? '',
          group.key,
          JOB_STATUS_LABEL[job.status as JobStatus] ?? job.status,
          job.start_date ?? '',
          job.end_date ?? '',
          job.contract_value ?? '',
          job.description ?? '',
        ])
      }
    }
    return rows
  }

  const exportCSV = () => {
    const BOM = '﻿'
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = BOM + buildExportRows().map(row => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `job_codes_${year}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet(buildExportRows())
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Job Codes ${year}`)
    XLSX.writeFile(wb, `job_codes_${year}.xlsx`)
  }

  // PDF is rendered server-side (src/app/api/pdf/jobs/route.ts) so it gets a
  // proper company letterhead — it re-derives the exact same grouping via
  // src/lib/jobs-grouping.ts from the same year/status/search/groupBy
  // params, rather than re-fetching whatever's already in this page's React
  // state, so it's always current as of the moment it's opened.
  const exportPDF = () => {
    const qs = new URLSearchParams({ year: String(year), status: 'all', groupBy, q: search.trim() })
    window.open(`/api/pdf/jobs?${qs}`, '_blank')
  }

  const handleSave = async () => {
    if (!form.job_code.trim() || !form.name_th.trim()) return
    if (editing) {
      await updateJob.mutateAsync({ id: editing.id, ...form })
      setEditing(null)
    } else {
      await createJob.mutateAsync({ ...form, year })
      setShowForm(false)
    }
    setForm({ job_code: '', name_th: '', name_en: '', client_name: '', description: '', contract_value: '', start_date: '', end_date: '', sequence_no: '' })
  }

  // Dropdown onChange — if moving AWAY from active, hold for confirmation
  // instead of saving immediately (see STATUS_WARNING above). Moving back to
  // active (reopening/reactivating) needs no warning, since it only ever
  // widens what's selectable — no data gets hidden by that direction.
  const handleStatusChange = (job: any, nextStatus: JobStatus) => {
    if (nextStatus === job.status) return
    if (STATUS_WARNING[nextStatus]) setConfirmChange({ job, nextStatus })
    else updateJob.mutateAsync({ id: job.id, status: nextStatus })
  }

  const confirmStatusChange = async () => {
    if (!confirmChange) return
    await updateJob.mutateAsync({ id: confirmChange.job.id, status: confirmChange.nextStatus })
    setConfirmChange(null)
  }

  const startEdit = (job: any) => {
    setEditing(job)
    setForm({
      job_code: job.job_code, name_th: job.name_th, name_en: job.name_en ?? '',
      client_name: job.client_name ?? '', description: job.description ?? '',
      contract_value: job.contract_value != null ? String(job.contract_value) : '',
      start_date: job.start_date ?? '', end_date: job.end_date ?? '',
      sequence_no: job.sequence_no != null ? String(job.sequence_no) : '',
    })
    setShowForm(true)
  }

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-gray-500" />
          <h1>Job Codes</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="form-input w-auto">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Link
            href="/access/jobs/import"
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" />
            นำเข้า CSV
          </Link>

          {/* Export (2026-10-21, "ควรจะ export ออกมาเป็น PDF excel csv") —
              CSV/Excel are built client-side from the exact rows/order
              already on screen (search + grouping applied); PDF is rendered
              server-side (src/app/api/pdf/jobs/route.ts) from the SAME
              src/lib/jobs-grouping.ts logic so all 3 formats, and the
              screen, always agree on what "the list" means right now. */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={exportCSV} title="Export CSV"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
              <FileText className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportExcel} title="Export Excel"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
            <button onClick={exportPDF} title="Export PDF"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
          </div>

          <button
            onClick={() => { setEditing(null); setForm({ job_code:'',name_th:'',name_en:'',client_name:'',description:'',contract_value:'',start_date:'',end_date:'',sequence_no:'' }); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            <Plus className="w-4 h-4" />
            เพิ่ม Job
          </button>
        </div>
      </div>

      {/* มูลค่างาน summary — ยอดรายได้แต่ละปี + ยอดรวมทั้งหมด (2026-10-21,
          "Job Codes ต้องมีให้เพิ่มมูลค่างานด้วยจะดีมาก จะได้ยอดรายได้แต่ละปี
          และยอดรวมทั้งหมด"). Covers every year a Job was ever entered, not
          just the 4 years in the dropdown above — see
          src/app/api/admin/jobs/revenue-summary/route.ts. */}
      {revenue && revenue.countWithValue > 0 && (
        <div className="card card-body space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Coins className="w-4 h-4 text-amber-500" />
            มูลค่างานรวม
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs text-gray-400">ยอดรวมทั้งหมด (ทุกปี)</p>
              <p className="text-2xl font-semibold text-gray-900">{formatTHB(revenue.total)}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {revenue.byYear.map(({ year: y, value }) => (
                <div key={y} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-400">ปี {y}</p>
                  <p className="text-sm font-medium text-gray-800">{formatTHB(value)}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            มีการระบุมูลค่างานแล้ว {revenue.countWithValue} จาก {revenue.countTotal} Job (ทุกปี)
          </p>
        </div>
      )}

      {/* Search + grouping */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา Job Code, ชื่องาน, ลูกค้า"
            className="form-input pl-9"
          />
        </div>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setGroupBy('year')}
            className={cn('px-3 py-1.5 rounded-md text-sm transition-colors', groupBy === 'year' ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
          >
            จัดกลุ่มตามปี
          </button>
          <button
            onClick={() => setGroupBy('client')}
            className={cn('px-3 py-1.5 rounded-md text-sm transition-colors', groupBy === 'client' ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
          >
            จัดกลุ่มตามลูกค้า
          </button>
        </div>

        {groupKeys.length > 0 && (
          <button onClick={toggleAllGroups} className="text-xs text-gray-500 hover:text-blue-700 underline underline-offset-2">
            {allCollapsed ? 'ขยายทั้งหมด' : 'ย่อทั้งหมด'}
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">{editing ? 'แก้ไข Job' : `เพิ่ม Job ปี ${year}`}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Job Code *</label>
              <input value={form.job_code} onChange={e => setForm(f => ({ ...f, job_code: e.target.value }))}
                className="form-input font-mono" placeholder="JOB001" disabled={!!editing} />
            </div>
            {/* ลำดับ Job อยู่ถัดจาก Job Code ทันที (2026-10-21, "ลำดับ Job
                ควรจะอยู่ด้านหน้าสุด") — ย้ายขึ้นมาให้ตรงกับคอลัมน์ "ลำดับ"
                ซึ่งตอนนี้เป็นคอลัมน์แรกในตารางด้านล่าง */}
            <div>
              <label className="form-label">ลำดับ Job</label>
              <input type="number" step="1" value={form.sequence_no}
                onChange={e => setForm(f => ({ ...f, sequence_no: e.target.value }))}
                className="form-input" placeholder="เช่น 1 (ใช้จัดลำดับการแสดงผล)" />
            </div>
            <div>
              <label className="form-label">ชื่องาน (ไทย) *</label>
              <input value={form.name_th} onChange={e => setForm(f => ({ ...f, name_th: e.target.value }))}
                className="form-input" placeholder="โครงการก่อสร้าง A" />
            </div>
            <div>
              <label className="form-label">ชื่องาน (อังกฤษ)</label>
              <input value={form.name_en} onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
                className="form-input" placeholder="Construction Project A" />
            </div>
            <div>
              <label className="form-label">ลูกค้า</label>
              <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                className="form-input" placeholder="บริษัท ABC จำกัด" />
            </div>
            <div>
              <label className="form-label">มูลค่างาน (บาท)</label>
              <input type="number" min="0" step="0.01" value={form.contract_value}
                onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))}
                className="form-input" placeholder="เช่น 500000" />
            </div>
            <div>
              <label className="form-label">วันที่เริ่ม</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="form-input" />
            </div>
            <div>
              <label className="form-label">วันที่สิ้นสุด</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="form-input" />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">รายละเอียด</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="form-input resize-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowForm(false); setEditing(null) }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button
              onClick={handleSave}
              disabled={!form.job_code || !form.name_th || createJob.isPending || updateJob.isPending}
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {createJob.isPending || updateJob.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-14 text-right">ลำดับ</th>
                <th>Job Code</th>
                <th>ชื่องาน</th>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th>ระยะเวลา</th>
                <th className="text-right">มูลค่างาน</th>
                <th className="w-24 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {groupKeys.map(code => {
                const groupId = `${groupBy}:${code}`
                const groupJobs = groupMap.get(code)!
                const isCollapsed = collapsed.has(groupId)
                return (
                <Fragment key={groupId}>
                  <tr className="bg-gray-50 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleGroup(groupId)}>
                    <td colSpan={8} className="!py-1.5 text-xs font-semibold text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {code} <span className="text-gray-400 font-normal">({groupJobs.length})</span>
                      </span>
                    </td>
                  </tr>
                  {!isCollapsed && groupJobs.map((job: any) => (
                    <tr key={job.id}>
                      <td className="text-sm text-gray-500 text-right">{job.sequence_no ?? '—'}</td>
                      <td className="font-mono text-sm font-medium text-gray-900">{job.job_code}</td>
                      <td>
                        <p className="text-sm text-gray-900">{job.name_th}</p>
                        {job.name_en && <p className="text-xs text-gray-400">{job.name_en}</p>}
                      </td>
                      <td className="text-sm text-gray-600">{job.client_name ?? '—'}</td>
                      <td>
                        <select
                          value={job.status}
                          onChange={e => handleStatusChange(job, e.target.value as JobStatus)}
                          className={cn('form-input w-auto !py-1 !px-2 text-xs font-medium border-0', STATUS_COLOR[job.status as JobStatus])}
                        >
                          {(['active', 'inactive', 'closed'] as JobStatus[]).map(s => (
                            <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-xs text-gray-500 whitespace-nowrap">
                        {job.start_date || job.end_date
                          ? <>{formatThaiDate(job.start_date)} – {formatThaiDate(job.end_date)}</>
                          : '—'}
                      </td>
                      <td className="text-sm text-gray-600 text-right whitespace-nowrap">{formatTHB(job.contract_value)}</td>
                      <td>
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => startEdit(job)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDelete(job)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
                )
              })}
              {!filteredJobs.length && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                    {jobs.length ? 'ไม่พบ Job ที่ค้นหา' : `ยังไม่มี Job ปี ${year}`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        {q ? `พบ ${filteredJobs.length} จาก ${jobs.length} Jobs ปี ${year}` : `รวม ${jobs.length} Jobs ปี ${year}`}
      </p>

      {/* Confirm modal — moving a Job to inactive/closed (2026-10-20, "ข้อ 6") */}
      {confirmChange && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="card card-body max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  เปลี่ยนสถานะ &quot;{confirmChange.job.job_code}&quot; เป็น {JOB_STATUS_LABEL[confirmChange.nextStatus]}?
                </h3>
                <p className="text-sm text-gray-600 mt-1.5">{STATUS_WARNING[confirmChange.nextStatus]}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmChange(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={updateJob.isPending}
                className="flex-1 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
              >
                {updateJob.isPending ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal — delete Job (2026-10-20, "ไม่มีปุ่มลบ") */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="card card-body max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  ลบ &quot;{confirmDelete.job_code}&quot; ถาวร?
                </h3>
                <p className="text-sm text-gray-600 mt-1.5">
                  ใช้สำหรับ Job ที่กรอกผิดและยังไม่เคยถูกใช้งาน — ถ้า Job นี้มีข้อมูล Timesheet/OT/งานชดเชยผูกอยู่แล้ว
                  ระบบจะไม่ยอมให้ลบและจะแจ้งเหตุผล กรุณาเปลี่ยนสถานะเป็น &quot;ปิด&quot; แทนในกรณีนั้น
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteJob.mutateAsync(confirmDelete.id)
                    setConfirmDelete(null)
                  } catch {
                    // onError toast already shown by the mutation itself;
                    // keep the modal open so the admin can re-read the
                    // reason and pick "ปิด" from the status dropdown instead.
                  }
                }}
                disabled={deleteJob.isPending}
                className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {deleteJob.isPending ? 'กำลังลบ...' : 'ลบถาวร'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
