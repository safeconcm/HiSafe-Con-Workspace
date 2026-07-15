// src/hooks/useLeave.ts
// TanStack Query hooks for Leave Management module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'

// ── Types ────────────────────────────────────────────────────

interface LeaveListParams {
  page?: number
  limit?: number
  status?: string
  leave_type?: string
  year?: number
  user_id?: string
  // "Only requests I personally filed" — see own_only comment in
  // src/app/api/leave/route.ts. Used by the "ใบลาของฉัน" page so a
  // supervisor's own list isn't mixed with their reports' pending requests.
  ownOnly?: boolean
  // "Only requests I need to act on / have decided on" — see approver_only
  // comment in src/app/api/leave/route.ts. Used by /approvals/leave so a
  // supervisor's own submitted leave never shows up in their own approval
  // queue.
  approverOnly?: boolean
  // HR's 2nd-step check queue (2026-07-14) — 'pending' | 'done'. See hr_check
  // comment in src/app/api/leave/route.ts.
  hrCheck?: 'pending' | 'done'
}

interface CreateLeaveBody {
  leave_type: string
  start_date: string
  end_date: string
  is_half_day: boolean
  half_day_period?: 'morning' | 'afternoon'
  reason?: string
  attachment_url?: string
  // 2026-07-14: paper-form fields ("ใบลา") — all optional.
  place_written?: string
  medical_cert_provided?: boolean
  // 2026-07-16: sub-classification of leave_type='other', used only by the
  // Timesheet official-form PDF (T/I/M absence codes). Optional.
  other_subtype?: 'training' | 'injury' | 'authorized'
  // contact_during_leave removed from here (2026-07-14, part 2) — "ติดต่อ
  // ได้ที่" / "เบอร์โทร" are now pulled live from the requester's Profile
  // (users.address / users.phone) at PDF-render time instead of being
  // re-typed per leave request. The column still exists on old rows.
}

// ── Fetchers ─────────────────────────────────────────────────

async function fetchLeaves(params: LeaveListParams) {
  const qs = new URLSearchParams()
  if (params.page)       qs.set('page',       String(params.page))
  if (params.limit)      qs.set('limit',      String(params.limit))
  if (params.status)     qs.set('status',     params.status)
  if (params.leave_type) qs.set('leave_type', params.leave_type)
  if (params.year)       qs.set('year',       String(params.year))
  if (params.user_id)    qs.set('user_id',    params.user_id)
  if (params.ownOnly)      qs.set('own_only',      '1')
  if (params.approverOnly) qs.set('approver_only', '1')
  if (params.hrCheck)      qs.set('hr_check',      params.hrCheck)

  const res  = await fetch(`/api/leave?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed to fetch leaves')
  return json.data
}

async function fetchLeave(id: string) {
  const res  = await fetch(`/api/leave/${id}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Not found')
  return json.data
}

async function fetchLeaveBalance(year?: number) {
  const qs  = year ? `?year=${year}` : ''
  const res  = await fetch(`/api/leave/balance${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed')
  return json.data
}

// ── Query hooks ───────────────────────────────────────────────

export function useLeaves(params: LeaveListParams = {}) {
  return useQuery({
    queryKey: ['leaves', params],
    queryFn:  () => fetchLeaves(params),
  })
}

export function useLeave(id: string | null) {
  return useQuery({
    queryKey: ['leave', id],
    queryFn:  () => fetchLeave(id!),
    enabled:  !!id,
  })
}

export function useLeaveBalance(year?: number) {
  return useQuery({
    queryKey: ['leave-balance', year ?? new Date().getFullYear()],
    queryFn:  () => fetchLeaveBalance(year),
  })
}

export function usePendingLeaves() {
  return useQuery({
    queryKey: ['leaves', 'pending'],
    queryFn:  () => fetchLeaves({ status: 'pending', limit: 50 }),
    refetchInterval: 60_000,
  })
}

// ── Mutation hooks ────────────────────────────────────────────

export function useCreateLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateLeaveBody) => {
      const res  = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create leave')
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
      toast.success('ยื่นใบลาสำเร็จ', 'ระบบส่งแจ้งเตือนถึงผู้อนุมัติแล้ว')
    },
    onError: (err: Error) => {
      toast.error('ไม่สามารถยื่นใบลาได้', err.message)
    },
  })
}

// Medical certificate file upload — separate step right after creating a
// sick leave request with "มีใบรับรองแพทย์" checked. See
// /api/leave/[id]/medical-cert. 2026-07-14.
export function useUploadMedicalCert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`/api/leave/${id}/medical-cert`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to upload')
      return json.data
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leave', id] })
    },
    onError: (err: Error) => {
      toast.error('แนบใบรับรองแพทย์ไม่สำเร็จ', err.message + ' — ยื่นใบลาสำเร็จแล้ว แนบไฟล์ใหม่ได้ภายหลัง')
    },
  })
}

export function useApproveLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const res  = await fetch(`/api/leave/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      qc.invalidateQueries({ queryKey: ['leave', id] })
      toast.success('อนุมัติใบลาแล้ว')
    },
    onError: (err: Error) => toast.error('เกิดข้อผิดพลาด', err.message),
  })
}

export function useRejectLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, rejection_reason }: { id: string; rejection_reason: string }) => {
      const res  = await fetch(`/api/leave/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      qc.invalidateQueries({ queryKey: ['leave', id] })
      toast.success('ปฏิเสธใบลาแล้ว')
    },
    onError: (err: Error) => toast.error('เกิดข้อผิดพลาด', err.message),
  })
}

// HR's 2nd-step check/acknowledgment — 2026-07-14. See LeaveHRCheckPanel.
export function useHRCheckLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, comment, decision }: { id: string; comment?: string; decision?: 'approved' | 'rejected' }) => {
      const res  = await fetch(`/api/leave/${id}/hr-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, decision }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      qc.invalidateQueries({ queryKey: ['leave', id] })
      toast.success('บันทึกการตรวจสอบแล้ว')
    },
    onError: (err: Error) => toast.error('เกิดข้อผิดพลาด', err.message),
  })
}

export function useCancelLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cancel_reason }: { id: string; cancel_reason?: string }) => {
      const res  = await fetch(`/api/leave/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      qc.invalidateQueries({ queryKey: ['leave-balance'] })
      toast.success('ยกเลิกใบลาแล้ว')
    },
    onError: (err: Error) => toast.error('เกิดข้อผิดพลาด', err.message),
  })
}
