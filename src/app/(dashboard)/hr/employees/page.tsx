'use client'
// src/app/(dashboard)/hr/employees/page.tsx
// HR's own read-only employee directory (2026-10-16), replacing the old
// "ข้อมูลพนักงานทั้งหมด" link that pointed into CONNEX Access
// (/access/users). That overlap existed because /access/users used to do
// double duty as both Admin's user-management page and HR's read-only
// directory — now that CONNEX Access is Admin-only (see src/app/access/
// layout.tsx and src/middleware.ts, follow-up: "ต้องจำกัดให้ Admin เข้าใช้"),
// HR needs its own page instead of being routed into a module it can no
// longer open.
//
// Deliberately list-only for this first cut — no add/import (those stay
// Admin-only in CONNEX Access) and no drill-into-detail (the existing
// employee-360 detail page at /access/users/[id] now lives inside the
// Admin-only module; giving HR a read view of it is a reasonable follow-up
// but a bigger page to duplicate/split out, so it's left for a later pass
// rather than blocking this fix).
import { useState }     from 'react'
import { useUsers }     from '@/hooks/useAdmin'
import { ROLE_LABEL, cn, fullNameTH } from '@/utils'
import { Search, Loader2, Users as UsersIcon } from 'lucide-react'
import type { UserRole, UserStatus } from '@/types/database'

const STATUS_COLOR: Record<UserStatus, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  resigned: 'bg-red-100 text-red-600',
}
const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'ทำงานอยู่', inactive: 'ระงับ', resigned: 'ลาออก',
}
const ROLE_COLOR: Record<UserRole, string> = {
  employee:   'bg-blue-50 text-blue-700',
  supervisor: 'bg-purple-50 text-purple-700',
  hr:         'bg-amber-50 text-amber-700',
  admin:      'bg-red-50 text-red-700',
}
const EMPLOYMENT_LABEL: Record<string, string> = {
  permanent: 'ประจำ', probation: 'ทดลองงาน',
}
const EMPLOYMENT_COLOR: Record<string, string> = {
  permanent: 'bg-green-50 text-green-700', probation: 'bg-amber-50 text-amber-700',
}

export default function HrEmployeesPage() {
  const [q,      setQ]      = useState('')
  const [role,   setRole]   = useState('')
  const [status, setStatus] = useState('active')
  const [page,   setPage]   = useState(1)

  const { data, isLoading } = useUsers({ q: q || undefined, role: role || undefined, status, page, limit: 30 })
  const users = data?.users ?? []
  const total = data?.total ?? 0

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center gap-2">
        <UsersIcon className="w-5 h-5 text-gray-500" />
        <h1>ข้อมูลพนักงานทั้งหมด</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder="ค้นหาชื่อ, รหัส, อีเมล"
            className="form-input pl-9"
          />
        </div>

        <select value={role} onChange={e => { setRole(e.target.value); setPage(1) }} className="form-input w-auto">
          <option value="">ทุก Role</option>
          {(Object.entries(ROLE_LABEL) as [UserRole, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(['active', 'inactive', 'resigned'] as UserStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                status === s ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <span className="text-sm text-gray-400">ทั้งหมด {total} คน</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <th>รหัส</th>
                  <th>แผนก / ตำแหน่ง</th>
                  <th>Role</th>
                  <th>สถานะพนักงาน</th>
                  <th>สถานะ</th>
                  <th>วันเริ่มงาน</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium shrink-0">
                          {u.first_name_th.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{fullNameTH(u)}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-gray-600 font-mono">{u.employee_code}</td>
                    <td>
                      <p className="text-sm text-gray-700">{u.department ?? '—'}</p>
                      <p className="text-xs text-gray-400">{u.position_th ?? ''}</p>
                    </td>
                    <td>
                      <span className={cn('badge', ROLE_COLOR[u.role as UserRole])}>
                        {ROLE_LABEL[u.role as UserRole]}
                      </span>
                    </td>
                    <td>
                      {u.employment_status ? (
                        <>
                          <span className={cn('badge', EMPLOYMENT_COLOR[u.employment_status])}>
                            {EMPLOYMENT_LABEL[u.employment_status]}
                          </span>
                          {u.employment_status === 'probation' && u.probation_end && (
                            <p className="text-xs text-gray-400 mt-1">ถึง {u.probation_end}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">ไม่ระบุ</span>
                      )}
                    </td>
                    <td>
                      <span className={cn('badge', STATUS_COLOR[u.status as UserStatus])}>
                        {STATUS_LABEL[u.status as UserStatus]}
                      </span>
                    </td>
                    <td className="text-sm text-gray-600 whitespace-nowrap">{u.hire_date}</td>
                  </tr>
                ))}
                {!users.length && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">ไม่พบพนักงาน</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {users.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
                  {u.first_name_th.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{fullNameTH(u)}</p>
                  <p className="text-xs text-gray-400">{u.employee_code} · {ROLE_LABEL[u.role as UserRole]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 30 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">ก่อนหน้า</button>
          <span className="px-4 py-2 text-sm text-gray-600">หน้า {page} / {Math.ceil(total / 30)}</span>
          <button disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 hover:bg-gray-50">ถัดไป</button>
        </div>
      )}
    </div>
  )
}
