'use client'
// src/app/(dashboard)/hr/recruitment/page.tsx
import { useState }   from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }      from '@/components/ui/Toaster'
import { cn }         from '@/utils'
import { Briefcase, Plus, Users, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

const RECRUIT_STATUS_LABEL: Record<string,string> = {
  open:'เปิดรับ', screening:'คัดกรอง', interviewing:'สัมภาษณ์',
  offering:'เสนองาน', hired:'จ้างแล้ว', cancelled:'ปิด',
}
const RECRUIT_STATUS_COLOR: Record<string,string> = {
  open:'bg-green-100 text-green-700', screening:'bg-blue-100 text-blue-700',
  interviewing:'bg-purple-100 text-purple-700', offering:'bg-amber-100 text-amber-700',
  hired:'bg-gray-100 text-gray-600', cancelled:'bg-red-100 text-red-600',
}

export default function RecruitmentPage() {
  const qc = useQueryClient()
  const [showNewJob, setShowNewJob] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string|null>(null)
  const [jobForm, setJobForm] = useState({ title_th:'', department:'', headcount:'1', salary_min:'', salary_max:'', requirements:'' })
  const [appForm, setAppForm] = useState({ job_opening_id:'', first_name:'', last_name:'', email:'', phone:'', status:'screening' })
  const [showAddApp, setShowAddApp] = useState<string|null>(null)

  const { data: openingsData, isLoading } = useQuery({
    queryKey: ['job-openings'],
    queryFn: async () => (await (await fetch('/api/hr/recruitment?type=openings&limit=20')).json()).data,
  })

  const { data: appsData } = useQuery({
    queryKey: ['applicants', expandedJob],
    queryFn: async () => (await (await fetch(`/api/hr/recruitment?type=applicants&job_id=${expandedJob}&limit=50`)).json()).data,
    enabled: !!expandedJob,
  })

  const openings    = openingsData?.openings    ?? []
  const applicants  = appsData?.applicants      ?? []

  const createJob = useMutation({
    mutationFn: async (body: typeof jobForm) => {
      const res  = await fetch('/api/hr/recruitment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'opening', ...body, headcount: parseInt(body.headcount), salary_min: body.salary_min ? parseFloat(body.salary_min) : null, salary_max: body.salary_max ? parseFloat(body.salary_max) : null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-openings'] })
      toast.success('สร้างประกาศงานแล้ว')
      setShowNewJob(false)
      setJobForm({ title_th:'', department:'', headcount:'1', salary_min:'', salary_max:'', requirements:'' })
    },
    onError: (e: Error) => toast.error('สร้างไม่สำเร็จ', e.message),
  })

  const addApplicant = useMutation({
    mutationFn: async (body: typeof appForm) => {
      const res  = await fetch('/api/hr/recruitment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'applicant', ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applicants'] })
      toast.success('เพิ่มผู้สมัครแล้ว')
      setShowAddApp(null)
      setAppForm({ job_opening_id:'', first_name:'', last_name:'', email:'', phone:'', status:'screening' })
    },
    onError: (e: Error) => toast.error('เพิ่มไม่สำเร็จ', e.message),
  })

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-gray-500" />
          <h1>ระบบสมัครงาน</h1>
        </div>
        <button onClick={() => setShowNewJob(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
          <Plus className="w-4 h-4" />ประกาศรับสมัคร
        </button>
      </div>

      {/* New Job Opening Form */}
      {showNewJob && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">ประกาศรับสมัครงานใหม่</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="form-label">ชื่อตำแหน่ง (ไทย) *</label>
              <input value={jobForm.title_th} onChange={e => setJobForm(f => ({ ...f, title_th: e.target.value }))}
                className="form-input" placeholder="วิศวกรโยธา" />
            </div>
            <div>
              <label className="form-label">แผนก</label>
              <input value={jobForm.department} onChange={e => setJobForm(f => ({ ...f, department: e.target.value }))}
                className="form-input" placeholder="Engineering" />
            </div>
            <div>
              <label className="form-label">จำนวนที่รับ</label>
              <input type="number" value={jobForm.headcount} min={1}
                onChange={e => setJobForm(f => ({ ...f, headcount: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">เงินเดือนต่ำสุด</label>
              <input type="number" value={jobForm.salary_min}
                onChange={e => setJobForm(f => ({ ...f, salary_min: e.target.value }))} className="form-input" placeholder="25000" />
            </div>
            <div>
              <label className="form-label">เงินเดือนสูงสุด</label>
              <input type="number" value={jobForm.salary_max}
                onChange={e => setJobForm(f => ({ ...f, salary_max: e.target.value }))} className="form-input" placeholder="35000" />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">คุณสมบัติ</label>
              <textarea rows={3} value={jobForm.requirements}
                onChange={e => setJobForm(f => ({ ...f, requirements: e.target.value }))}
                className="form-input resize-none" placeholder="ปริญญาตรีขึ้นไป, มีประสบการณ์ 2 ปี..." />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowNewJob(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button onClick={() => createJob.mutate(jobForm)} disabled={!jobForm.title_th || createJob.isPending}
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
              {createJob.isPending ? 'กำลังสร้าง...' : 'สร้างประกาศ'}
            </button>
          </div>
        </div>
      )}

      {/* Job Openings List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !openings.length ? (
        <div className="card p-10 text-center text-gray-400 text-sm">ยังไม่มีประกาศรับสมัครงาน</div>
      ) : (
        <div className="space-y-3">
          {openings.map((job: any) => (
            <div key={job.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{job.title_th}</p>
                    <span className={cn('badge', RECRUIT_STATUS_COLOR[job.status])}>{RECRUIT_STATUS_LABEL[job.status]}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    {job.department && <span>{job.department}</span>}
                    <span>รับ {job.headcount} คน</span>
                    {job.salary_min && <span>{Number(job.salary_min).toLocaleString()}—{Number(job.salary_max||0).toLocaleString()} ฿</span>}
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />ผู้สมัคร {job.applicant_count?.length ?? 0} คน</span>
                  </div>
                </div>
                {expandedJob === job.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>

              {/* Applicants */}
              {expandedJob === job.id && (
                <div className="border-t border-gray-100">
                  <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-600">ผู้สมัคร</p>
                    <button onClick={() => { setShowAddApp(job.id); setAppForm(f => ({ ...f, job_opening_id: job.id })) }}
                      className="text-xs text-blue-600 hover:underline">+ เพิ่มผู้สมัคร</button>
                  </div>

                  {showAddApp === job.id && (
                    <div className="px-5 py-3 border-b border-gray-100 bg-blue-50 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div><label className="form-label text-xs">ชื่อ *</label>
                          <input value={appForm.first_name} onChange={e => setAppForm(f => ({ ...f, first_name: e.target.value }))} className="form-input text-sm" /></div>
                        <div><label className="form-label text-xs">นามสกุล *</label>
                          <input value={appForm.last_name} onChange={e => setAppForm(f => ({ ...f, last_name: e.target.value }))} className="form-input text-sm" /></div>
                        <div><label className="form-label text-xs">อีเมล</label>
                          <input value={appForm.email} onChange={e => setAppForm(f => ({ ...f, email: e.target.value }))} className="form-input text-sm" /></div>
                        <div><label className="form-label text-xs">โทร</label>
                          <input value={appForm.phone} onChange={e => setAppForm(f => ({ ...f, phone: e.target.value }))} className="form-input text-sm" /></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowAddApp(null)} className="px-3 py-1.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-white">ยกเลิก</button>
                        <button onClick={() => addApplicant.mutate(appForm)} disabled={!appForm.first_name || !appForm.last_name || addApplicant.isPending}
                          className="px-3 py-1.5 rounded bg-blue-700 text-white text-xs hover:bg-blue-800 disabled:opacity-60">บันทึก</button>
                      </div>
                    </div>
                  )}

                  {applicants.map((ap: any) => (
                    <div key={ap.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{ap.first_name} {ap.last_name}</p>
                        <p className="text-xs text-gray-400">{ap.email ?? ''} {ap.phone ? `· ${ap.phone}` : ''}</p>
                      </div>
                      <span className={cn('badge text-xs', RECRUIT_STATUS_COLOR[ap.status])}>{RECRUIT_STATUS_LABEL[ap.status]}</span>
                    </div>
                  ))}
                  {!applicants.length && (
                    <div className="px-5 py-4 text-xs text-gray-400 text-center">ยังไม่มีผู้สมัคร</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
