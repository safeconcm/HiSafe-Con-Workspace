'use client'
// src/app/(dashboard)/hr/audit-logs/page.tsx
import { useState }       from 'react'
import { useQuery }       from '@tanstack/react-query'
import { formatDateTime, cn } from '@/utils'
import { ShieldCheck, Search, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

// Kept in sync with every `entity_type:` value written by writeAuditLog()
// across src/app/api/** — if a new entity type is added to the app, add its
// Thai label here too so the filter dropdown stays complete (any type
// missing from this map still displays fine in the table, just falls back
// to its raw name and won't show up in the "ประเภท Entity" filter list).
const ENTITY_LABELS: Record<string, string> = {
  leave_request:            'ใบลา',
  timesheet:                'Timesheet',
  leave_balance:            'ยอดวันลา',
  leave_policy:              'นโยบายการลา',
  user:                      'ผู้ใช้',
  job:                       'Job',
  job_opening:               'ตำแหน่งงาน',
  job_application:           'ใบสมัครงาน',
  applicant:                 'ผู้สมัคร',
  holiday:                   'วันหยุด',
  organization_node:         'Org',
  salary_record:             'เงินเดือน',
  company:                   'บริษัท',
  company_work_schedule:     'ตารางทำงานบริษัท',
  company_workday_override:  'วันทำงาน (เฉพาะวัน)',
  resignation:               'ใบลาออก',
  probation_evaluation:      'ประเมินทดลองงาน',
  ot_request:                'OT',
  onboarding_checklist:      'Onboarding',
  contract:                  'สัญญาจ้าง',
  certificate:               'หนังสือรับรอง',
  announcement:              'ประกาศ',
  hr_inquiry:                'คำถาม HR',
}

const ACTION_COLOR: Record<string, string> = {
  'leave.submitted':   'text-blue-700 bg-blue-50',
  'leave.approved':    'text-green-700 bg-green-50',
  'leave.rejected':    'text-red-700 bg-red-50',
  'leave.cancelled':   'text-gray-600 bg-gray-50',
  'timesheet.approved':'text-green-700 bg-green-50',
  'timesheet.rejected':'text-red-700 bg-red-50',
  'user.created':      'text-purple-700 bg-purple-50',
  'users.bulk_imported':'text-purple-700 bg-purple-50',
  'leave_balance.adjusted': 'text-amber-700 bg-amber-50',
}

async function fetchAuditLogs(params: Record<string, string>) {
  const qs  = new URLSearchParams(params)
  const res = await fetch(`/api/hr/audit-logs?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

export default function AuditLogsPage() {
  const [page,        setPage]        = useState(1)
  const [entityType,  setEntityType]  = useState('')
  const [action,      setAction]      = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [expanded,    setExpanded]    = useState<Set<number>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, entityType, action, dateFrom, dateTo],
    queryFn: () => fetchAuditLogs({
      page:  String(page),
      limit: '50',
      ...(entityType && { entity_type: entityType }),
      ...(action     && { action }),
      ...(dateFrom   && { date_from: dateFrom }),
      ...(dateTo     && { date_to: dateTo }),
    }),
  })

  const logs: any[]  = data?.logs ?? []
  const total        = data?.total ?? 0

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-gray-500" />
        <h1>Audit Log</h1>
        <span className="text-sm text-gray-400">{total.toLocaleString()} รายการ</span>
      </div>

      {/* Filters */}
      <div className="card card-body">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="form-label">ประเภท Entity</label>
            <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1) }} className="form-input">
              <option value="">ทั้งหมด</option>
              {Object.entries(ENTITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Action</label>
            <input
              type="text"
              value={action}
              onChange={e => { setAction(e.target.value); setPage(1) }}
              className="form-input"
              placeholder="leave.approved"
            />
          </div>
          <div>
            <label className="form-label">วันที่เริ่ม</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} className="form-input" />
          </div>
          <div>
            <label className="form-label">วันที่สิ้นสุด</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} className="form-input" />
          </div>
        </div>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>เวลา</th>
                  <th>ผู้กระทำ</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => {
                  const isExp = expanded.has(log.id)
                  const actionColor = Object.entries(ACTION_COLOR).find(([k]) => log.action?.startsWith(k.split('.')[0]))
                  const colorClass  = ACTION_COLOR[log.action] ?? 'text-gray-600 bg-gray-50'

                  return [
                    <tr key={log.id} className="cursor-pointer" onClick={() => toggleExpand(log.id)}>
                      <td>
                        {isExp
                          ? <ChevronDown  className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        }
                      </td>
                      <td className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td>
                        <p className="text-xs font-medium text-gray-900">{log.actor_email ?? 'ระบบ'}</p>
                        {log.actor_role && <p className="text-[10px] text-gray-400">{log.actor_role}</p>}
                      </td>
                      <td>
                        <span className={cn('badge text-[11px] font-mono', colorClass)}>
                          {log.action}
                        </span>
                      </td>
                      <td className="text-xs text-gray-600">
                        {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        {log.entity_id && (
                          <span className="ml-1 text-gray-400 font-mono text-[10px]">
                            #{log.entity_id.slice(-6)}
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-gray-400 font-mono">{log.ip_address ?? '—'}</td>
                    </tr>,
                    isExp && (
                      <tr key={`${log.id}-detail`} className="bg-gray-50">
                        <td></td>
                        <td colSpan={5} className="px-3 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            {log.old_data && (
                              <div>
                                <p className="font-medium text-gray-500 mb-1">ก่อน</p>
                                <pre className="bg-white border border-gray-200 rounded p-2 text-[10px] overflow-auto max-h-32 text-gray-700">
                                  {JSON.stringify(log.old_data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_data && (
                              <div>
                                <p className="font-medium text-gray-500 mb-1">หลัง</p>
                                <pre className="bg-white border border-gray-200 rounded p-2 text-[10px] overflow-auto max-h-32 text-gray-700">
                                  {JSON.stringify(log.new_data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
                {!logs.length && (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">ไม่พบรายการ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">ก่อนหน้า</button>
          <span className="px-4 py-2 text-sm text-gray-600">หน้า {page} / {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">ถัดไป</button>
        </div>
      )}
    </div>
  )
}
