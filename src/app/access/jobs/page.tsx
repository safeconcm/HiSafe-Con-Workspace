'use client'
// src/app/access/jobs/page.tsx
// Moved here (2026-10-16) from src/app/(dashboard)/admin/jobs/page.tsx — see
// src/app/access/layout.tsx for context.
import { useState }        from 'react'
import Link                from 'next/link'
import { useJobs, useCreateJob, useUpdateJob } from '@/hooks/useAdmin'
import { JOB_STATUS_LABEL, cn } from '@/utils'
import { Plus, Pencil, Loader2, Briefcase, Upload, AlertTriangle } from 'lucide-react'
import type { JobStatus } from '@/types/database'

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
  const [form,     setForm]     = useState({ job_code: '', name_th: '', name_en: '', client_name: '', description: '' })
  // Pending status change awaiting confirmation (2026-10-20, "ข้อ 6") — null
  // when no confirmation modal is open.
  const [confirmChange, setConfirmChange] = useState<{ job: any; nextStatus: JobStatus } | null>(null)

  const { data, isLoading } = useJobs(year, 'all')
  const createJob = useCreateJob()
  const updateJob = useUpdateJob()

  const jobs = data?.jobs ?? []
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 1 - i)

  const handleSave = async () => {
    if (!form.job_code.trim() || !form.name_th.trim()) return
    if (editing) {
      await updateJob.mutateAsync({ id: editing.id, ...form })
      setEditing(null)
    } else {
      await createJob.mutateAsync({ ...form, year })
      setShowForm(false)
    }
    setForm({ job_code: '', name_th: '', name_en: '', client_name: '', description: '' })
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
    setForm({ job_code: job.job_code, name_th: job.name_th, name_en: job.name_en ?? '', client_name: job.client_name ?? '', description: job.description ?? '' })
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
          <button
            onClick={() => { setEditing(null); setForm({ job_code:'',name_th:'',name_en:'',client_name:'',description:'' }); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            <Plus className="w-4 h-4" />
            เพิ่ม Job
          </button>
        </div>
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
                <th>Job Code</th>
                <th>ชื่องาน</th>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th className="w-24 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any) => (
                <tr key={job.id}>
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
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(job)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!jobs.length && (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">ยังไม่มี Job ปี {year}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">รวม {jobs.length} Jobs ปี {year}</p>

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
    </div>
  )
}
