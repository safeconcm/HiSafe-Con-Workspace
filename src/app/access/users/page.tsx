'use client'
// src/app/access/users/page.tsx
// Moved here (2026-10-16) from src/app/(dashboard)/admin/users/page.tsx — see
// src/app/access/layout.tsx for why this is now its own top-level module
// ("CONNEX Access") instead of living inside CONNEX EM's dashboard shell.
import { useState, useEffect, Fragment } from 'react'
import Link             from 'next/link'
import { useUsers, useDeleteUser } from '@/hooks/useAdmin'
import { ROLE_LABEL, cn, fullNameTH } from '@/utils'
import {
  Plus, Upload, Search, Loader2, Trash2, AlertTriangle,
  ChevronRight, UserCheck, UserX,
} from 'lucide-react'
import type { UserRole, UserStatus } from '@/types/database'

// Reads the session cookie directly, same pattern used by other client
// pages (e.g. src/app/(dashboard)/approvals/ot/page.tsx). Not using
// useAuthStore here — its setSession() is never called anywhere in the
// app, so session was always null and isAdmin was always false, hiding
// the "เพิ่มผู้ใช้"/"Import CSV" buttons from every admin, not just HR.
function useCurrentRole(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = document.cookie.split('; ').find(r => r.startsWith('connex_session='))
    if (!raw) return ''
    return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')))?.role ?? ''
  } catch { return '' }
}

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
// Sub-grouping order (2026-10-20, "เพิ่มกับ sub แบบกรณี Role") — top-down by
// authority, so admins/HR (who manage the list) see their own accounts
// first rather than scrolling past every employee.
const ROLE_ORDER: UserRole[] = ['admin', 'hr', 'supervisor', 'employee']

export default function AdminUsersPage() {
  // Search box typed value vs. the debounced value actually sent to the API
  // (2026-10-20, "เพิ่มช่องค้นหา") — typing fires a server query (q filters
  // employee_code/email/name in the DB, not just the current page), so this
  // waits 300ms after the last keystroke instead of firing one request per
  // character while still feeling instant to type into.
  const [qInput, setQInput] = useState('')
  const [q,      setQ]      = useState('')
  const [role,   setRole]   = useState('')
  const [status, setStatus] = useState('active')
  const [page,   setPage]   = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  // HR can view this list (same as Admin — see /api/admin/users GET), but
  // creating/importing users stays Admin-only, matching the API guard, so
  // those buttons are hidden rather than left as dead-end links for HR.
  const isAdmin = useCurrentRole() === 'admin'

  const { data, isLoading } = useUsers({ q: q || undefined, role: role || undefined, status, page, limit: 30 })
  const users = data?.users ?? []
  const total = data?.total ?? 0

  // Delete (2026-10-20, "จัดการผู้ใช้ก็เช่นเดียวกัน" — no delete button
  // complaint, same fix as Job Codes). Button always shows; the actual
  // "has this user got real history" check happens server-side.
  const deleteUser = useDeleteUser()
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)

  // Sub-group the current page by Role (2026-10-20, "sub แบบกรณี Role") —
  // only when no single Role filter is already chosen, since grouping one
  // role under its own role header would be redundant.
  const groupedUsers = role ? null : ROLE_ORDER
    .map(r => ({ role: r, items: users.filter((u: any) => u.role === r) }))
    .filter(g => g.items.length > 0)

  const renderRow = (u: any) => (
    <tr key={u.id}>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium shrink-0">
            {u.first_name_th.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{fullNameTH(u)}</p>
            {/* 2026-10-22: email is now optional — a user with none yet
                can't log in, so flag that plainly rather than showing a
                blank line (which read like a loading glitch). */}
            {u.email
              ? <p className="text-xs text-gray-400">{u.email}</p>
              : <p className="text-xs text-amber-600 italic">ยังไม่มีอีเมล — ยังไม่สามารถ login</p>}
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
        <div className="flex items-center gap-2 justify-end">
          {isAdmin && (
            <button
              onClick={() => setConfirmDelete(u)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              title="ลบผู้ใช้"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <Link href={`/access/users/${u.id}`} className="text-gray-400 hover:text-gray-700">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="page-container space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1>จัดการผู้ใช้</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/access/users/import"
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </Link>
            <Link
              href="/access/users/new"
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
            value={qInput}
            onChange={e => setQInput(e.target.value)}
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
                {groupedUsers ? (
                  groupedUsers.map(g => (
                    <Fragment key={g.role}>
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="!py-1.5 text-xs font-semibold text-gray-500">
                          {ROLE_LABEL[g.role]} <span className="text-gray-400 font-normal">({g.items.length})</span>
                        </td>
                      </tr>
                      {g.items.map(renderRow)}
                    </Fragment>
                  ))
                ) : (
                  users.map(renderRow)
                )}
                {!users.length && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">ไม่พบผู้ใช้</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-100">
            {(groupedUsers ?? [{ role: '' as UserRole, items: users }]).map(g => (
              <Fragment key={g.role || 'all'}>
                {groupedUsers && (
                  <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 bg-gray-50">
                    {ROLE_LABEL[g.role]} <span className="text-gray-400 font-normal">({g.items.length})</span>
                  </p>
                )}
                {g.items.map((u: any) => (
                  <Link key={u.id} href={`/access/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
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
              </Fragment>
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

      {/* Confirm modal — delete user (2026-10-20, "ไม่มีปุ่มลบ") */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="card card-body max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  ลบ &quot;{fullNameTH(confirmDelete)}&quot; ({confirmDelete.employee_code}) ถาวร?
                </h3>
                <p className="text-sm text-gray-600 mt-1.5">
                  ใช้สำหรับบัญชีที่กรอกผิดและยังไม่เคยมีประวัติการทำงาน (ไม่เคยลงเวลา/ลา/มีสัญญา-เงินเดือน) —
                  ถ้าผู้ใช้นี้มีประวัติแล้ว ระบบจะไม่ยอมให้ลบและจะแจ้งเหตุผล
                  กรุณาใช้ &quot;ระงับการใช้งาน&quot; หรือ &quot;ลาออก&quot; แทนในกรณีนั้น เพื่อรักษาประวัติไว้
                </p>
                <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  การลบนี้ถาวร กู้คืนไม่ได้
                </div>
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
                    await deleteUser.mutateAsync(confirmDelete.id)
                    setConfirmDelete(null)
                  } catch {
                    // onError toast already shown; keep modal open so the
                    // admin can re-read the reason.
                  }
                }}
                disabled={deleteUser.isPending}
                className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {deleteUser.isPending ? 'กำลังลบ...' : 'ลบถาวร'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
