'use client'
// src/app/(dashboard)/hr/job-applications/page.tsx
// List of applications submitted through the public /apply/[company] form.

import { useState }  from 'react'
import Link          from 'next/link'
import { useQuery }  from '@tanstack/react-query'
import { cn }        from '@/utils'
import { Search, Loader2, ChevronRight, FileText, Link2, Copy } from 'lucide-react'
import {
  JOB_APPLICATION_STATUS_LABEL as STATUS_LABEL,
  JOB_APPLICATION_STATUS_COLOR as STATUS_COLOR,
} from '@/types/job-application'

export default function JobApplicationsPage() {
  const [q,      setQ]      = useState('')
  const [status, setStatus] = useState('')
  const [page,   setPage]   = useState(1)
  const [copied, setCopied] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['job-applications', q, status, page],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (q)      qs.set('q', q)
      if (status) qs.set('status', status)
      qs.set('page', String(page)); qs.set('limit', '30')
      const res  = await fetch(`/api/hr/job-applications?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  const applications = data?.applications ?? []
  const total        = data?.total ?? 0

  const copyLink = (path: string) => {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    setCopied(path)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          <h1>ใบสมัครงานออนไลน์</h1>
        </div>
      </div>

      {/* Shareable application links */}
      <div className="card card-body">
        <p className="text-sm font-medium text-gray-700 mb-2">ลิงก์ใบสมัครสำหรับส่งให้ผู้สมัคร</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[{ code: 'safecon', label: 'Safecon' }, { code: 'highcon', label: 'Highcon' }].map(c => (
            <div key={c.code} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-700 flex-1 truncate">/apply/{c.code}</span>
              <button
                onClick={() => copyLink(`/apply/${c.code}`)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied === `/apply/${c.code}` ? 'คัดลอกแล้ว' : `คัดลอกลิงก์ ${c.label}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text" value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder="ค้นหาชื่อ, อีเมล, เบอร์โทร"
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="form-input w-auto">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !applications.length ? (
        <div className="card p-10 text-center text-gray-400 text-sm">ยังไม่มีใบสมัครงานเข้ามา</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>ชื่อ-นามสกุล</th>
                <th>ตำแหน่งที่สมัคร</th>
                <th>ติดต่อ</th>
                <th>สถานะ</th>
                <th>วันที่สมัคร</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a: any) => (
                <tr key={a.id}>
                  <td className="w-10">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400 shrink-0">
                      {a.full_name_th?.[0] ?? '?'}
                    </div>
                  </td>
                  <td className="font-medium text-gray-900">{a.full_name_th}</td>
                  <td className="text-gray-600">{a.position_applied_1}</td>
                  <td className="text-gray-500 text-xs">{a.email}<br />{a.mobile}</td>
                  <td><span className={cn('badge', STATUS_COLOR[a.status])}>{STATUS_LABEL[a.status]}</span></td>
                  <td className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('th-TH')}</td>
                  <td className="w-10">
                    <Link href={`/hr/job-applications/${a.id}`} className="text-gray-400 hover:text-gray-600">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 30 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-40">ก่อนหน้า</button>
          <span className="text-sm text-gray-500 self-center">หน้า {page}</span>
          <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-40">ถัดไป</button>
        </div>
      )}
    </div>
  )
}
