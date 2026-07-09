'use client'
// src/app/(dashboard)/admin/users/page.tsx
import { useState }     from 'react'
import Link             from 'next/link'
import { useUsers }     from '@/hooks/useAdmin'
import { ROLE_LABEL, cn, fullNameTH } from '@/utils'
import {
  Plus, Upload, Search, Loader2,
  ChevronRight, UserCheck, UserX,
} from 'lucide-react'
import type { UserRole, UserStatus } from '@/types/database'
import { useAuthStore } from '@/store/auth.store'

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

export default function AdminUsersPage() {
  const [q,      setQ]      = useState('')
  const [role,   setRole]   = useState('')
  const [status, setStatus] = useState('active')
  const [page,   setPage]   = useState(1)

  // HR can view this list (same as Admin — see /api/admin/users GET), but
  // creating/importing users stays Admin-only, matching the API guard, so
  // those buttons are hidden rather than left as dead-end links for HR.
  const isAdmin = useAuthStore(s => s.session?.role) === 'admin'

  const { data, isLoading } = useUsers({ q: q || undefined, role: role || undefined, status, page, limit: 30 })
  const users = data?.users ?? []
  const total = data?.total ?? 0

  return (
    <div className="page-container space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1>จัดการผู้ใช้</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/admin/users/import"
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </Link>
            <Link
              href="/admin/users/new"
              className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              <Plus className="w-4 h-4" />
              เพิ่มผู้ใช้
            </Link>
          </div>
        )}
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
                  <th className="w-10"></th>
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
                    <td>
                      <Link href={`/admin/users/${u.id}`} className="text-gray-400 hover:text-gray-700">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">ไม่พบผู้ใช้</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {users.map((u: any) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium shrink-0">
                  {u.first_name_th.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{fullNameTH(u)}</p>
                  <p className="text-xs text-gray-400">{u.employee_code} · {ROLE_LABEL[u.role as UserRole]}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
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
