// src/hooks/useAdmin.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'

// ── Users ────────────────────────────────────────────────────

interface UserListParams {
  q?: string; role?: string; status?: string
  page?: number; limit?: number
}

export function useUsers(params: UserListParams = {}) {
  const qs = new URLSearchParams()
  if (params.q)      qs.set('q',      params.q)
  if (params.role)   qs.set('role',   params.role)
  if (params.status) qs.set('status', params.status)
  if (params.page)   qs.set('page',   String(params.page))
  if (params.limit)  qs.set('limit',  String(params.limit))

  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: async () => {
      const res  = await fetch(`/api/admin/users?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: ['admin-user', id],
    queryFn: async () => {
      const res  = await fetch(`/api/admin/users/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    enabled: !!id,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res  = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('เพิ่มผู้ใช้แล้ว', 'ระบบส่งอีเมลตั้งรหัสผ่านให้ผู้ใช้แล้ว')
    },
    onError: (e: Error) => toast.error('ไม่สามารถเพิ่มผู้ใช้', e.message),
  })
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res  = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-user', id] })
      toast.success('บันทึกข้อมูลแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res  = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('ลบผู้ใช้แล้ว')
    },
    onError: (e: Error) => toast.error('ลบไม่สำเร็จ', e.message),
  })
}

export function useImportUsers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: any[]) => {
      const res  = await fetch('/api/admin/users/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      if (data.created > 0) {
        toast.success(`นำเข้า ${data.created} รายการสำเร็จ`, data.failed > 0 ? `ล้มเหลว ${data.failed} รายการ` : undefined)
      }
    },
    onError: (e: Error) => toast.error('นำเข้าไม่สำเร็จ', e.message),
  })
}

// ── Jobs ─────────────────────────────────────────────────────

export function useJobs(year?: number, status?: string) {
  const y = year ?? new Date().getFullYear()
  return useQuery({
    queryKey: ['jobs', y, status ?? 'active'],
    queryFn: async () => {
      const qs = new URLSearchParams({ year: String(y) })
      if (status) qs.set('status', status)
      const res  = await fetch(`/api/admin/jobs?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res  = await fetch('/api/admin/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('เพิ่ม Job สำเร็จ')
    },
    onError: (e: Error) => toast.error('ไม่สามารถเพิ่ม Job', e.message),
  })
}

export function useImportJobs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rows, year }: { rows: any[]; year: number }) => {
      const res  = await fetch('/api/admin/jobs/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, year }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      // 2026-10-21: a re-import that only backfills existing Jobs (created
      // === 0 but updated > 0) is now a normal, expected outcome — not a
      // no-op — so it needs its own success toast too, not just the
      // "created > 0" case from before duplicate-backfill existed.
      if (data.created > 0 || data.updated > 0) {
        const parts = [
          data.created > 0 ? `สร้างใหม่ ${data.created}` : null,
          data.updated > 0 ? `เติมข้อมูลที่ขาด ${data.updated}` : null,
        ].filter(Boolean).join(' / ')
        toast.success(`นำเข้าสำเร็จ — ${parts} Job`, data.failed > 0 ? `ล้มเหลว ${data.failed} รายการ` : undefined)
      } else if (data.failed > 0) {
        toast.error('นำเข้าไม่สำเร็จ', `ล้มเหลว ${data.failed} รายการ`)
      }
    },
    onError: (e: Error) => toast.error('นำเข้าไม่สำเร็จ', e.message),
  })
}

export function useUpdateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const res  = await fetch(`/api/admin/jobs/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('อัปเดต Job แล้ว')
    },
    onError: (e: Error) => toast.error('อัปเดตไม่สำเร็จ', e.message),
  })
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res  = await fetch(`/api/admin/jobs/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('ลบ Job แล้ว')
    },
    onError: (e: Error) => toast.error('ลบไม่สำเร็จ', e.message),
  })
}

// มูลค่างาน — ยอดรายได้แต่ละปี + ยอดรวมทั้งหมด (2026-10-21). Query key starts
// with 'jobs' on purpose: every job mutation above already does
// qc.invalidateQueries({ queryKey: ['jobs'] }), which React Query matches as
// a prefix, so creating/editing/deleting a Job (including its
// contract_value) automatically refreshes this summary too — no extra
// invalidation wiring needed.
export function useJobsRevenueSummary() {
  return useQuery({
    queryKey: ['jobs', 'revenue-summary'],
    queryFn: async () => {
      const res  = await fetch('/api/admin/jobs/revenue-summary')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data as {
        byYear: { year: number; value: number; count: number; delta: number | null; deltaPct: number | null }[]
        byClient: { client: string; value: number; count: number }[]
        total: number; countWithValue: number; countTotal: number
        unassignedValue: number; unassignedCount: number
      }
    },
  })
}

// ── Org Tree ─────────────────────────────────────────────────

export function useOrgTree() {
  return useQuery({
    queryKey: ['org-tree'],
    queryFn: async () => {
      const res  = await fetch('/api/admin/org')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    staleTime: 60_000,
  })
}

export function useUpsertOrgNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      const res  = await fetch('/api/admin/org', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-tree'] })
      toast.success('บันทึกโครงสร้างองค์กรแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })
}

export function useUpdateOrgNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const res  = await fetch(`/api/admin/org/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-tree'] })
      toast.success('อัปเดตสายบังคับบัญชาแล้ว')
    },
    onError: (e: Error) => toast.error('อัปเดตไม่สำเร็จ', e.message),
  })
}
