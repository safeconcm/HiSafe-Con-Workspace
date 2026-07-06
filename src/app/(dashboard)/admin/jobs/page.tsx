'use client'
// src/app/(dashboard)/admin/jobs/page.tsx
import { useState }        from 'react'
import { useJobs, useCreateJob, useUpdateJob } from '@/hooks/useAdmin'
import { JOB_STATUS_LABEL, cn } from '@/utils'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, Briefcase } from 'lucide-react'
import type { JobStatus } from '@/types/database'

const STATUS_COLOR: Record<JobStatus, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  closed:   'bg-red-100 text-red-600',
}

export default function AdminJobsPage() {
  const now  = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<any | null>(null)
  const [form,     setForm]     = useState({ job_code: '', name_th: '', name_en: '', client_name: '', description: '' })

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

  const toggleStatus = async (job: any) => {
    const nextStatus = job.status === 'active' ? 'inactive' : 'active'
    await updateJob.mutateAsync({ id: job.id, status: nextStatus })
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
                    <span className={cn('badge', STATUS_COLOR[job.status as JobStatus])}>
                      {JOB_STATUS_LABEL[job.status as JobStatus]}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(job)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleStatus(job)}
                        className={cn('p-1 transition-colors', job.status === 'active' ? 'text-green-600 hover:text-gray-400' : 'text-gray-400 hover:text-green-600')}
                        title={job.status === 'active' ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      >
                        {job.status === 'active' ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
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
    </div>
  )
}
