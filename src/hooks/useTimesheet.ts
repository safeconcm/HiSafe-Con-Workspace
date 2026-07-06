// src/hooks/useTimesheet.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'

// ── Fetchers ─────────────────────────────────────────────────

async function fetchMonthTimesheet(year: number, month: number) {
  const res  = await fetch(`/api/timesheet?year=${year}&month=${month}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed')
  return json.data
}

async function fetchTimesheetDetail(id: string) {
  const res  = await fetch(`/api/timesheet/${id}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Not found')
  return json.data
}

async function fetchMyTimesheets() {
  const res  = await fetch('/api/timesheet')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed')
  return json.data
}

async function fetchPendingTimesheets() {
  const res  = await fetch('/api/hr/timesheet?status=submitted&limit=50')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Failed')
  return json.data
}

// ── Hooks ─────────────────────────────────────────────────────

export function useMonthTimesheet(year: number, month: number) {
  return useQuery({
    queryKey: ['timesheet', year, month],
    queryFn:  () => fetchMonthTimesheet(year, month),
    enabled:  !!year && !!month,
    staleTime: 30_000,
  })
}

export function useTimesheetDetail(id: string | null) {
  return useQuery({
    queryKey: ['timesheet-detail', id],
    queryFn:  () => fetchTimesheetDetail(id!),
    enabled:  !!id,
  })
}

export function useMyTimesheets() {
  return useQuery({
    queryKey: ['my-timesheets'],
    queryFn:  fetchMyTimesheets,
  })
}

export function usePendingTimesheets() {
  return useQuery({
    queryKey: ['pending-timesheets'],
    queryFn:  fetchPendingTimesheets,
    refetchInterval: 60_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────

interface SaveLine {
  work_date: string
  job_id:    string
  hours:     number
  remark?:   string
}

export function useSaveTimesheetLines(tsId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lines: SaveLine[]) => {
      const res  = await fetch(`/api/timesheet/${tsId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lines }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      return json.data
    },
    onSuccess: (data) => {
      qc.setQueryData(['timesheet-detail', tsId], data)
      toast.success('บันทึก Timesheet แล้ว')
    },
    onError: (err: Error) => toast.error('บันทึกไม่สำเร็จ', err.message),
  })
}

export function useSubmitTimesheet(tsId: string, year: number, month: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res  = await fetch(`/api/timesheet/${tsId}/submit`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet', year, month] })
      qc.invalidateQueries({ queryKey: ['timesheet-detail', tsId] })
      toast.success('ส่ง Timesheet แล้ว', 'รอการอนุมัติจากหัวหน้างาน')
    },
    onError: (err: Error) => toast.error('ส่งไม่สำเร็จ', err.message),
  })
}

export function useApproveTimesheet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const res  = await fetch(`/api/timesheet/${id}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ comment }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['timesheet-detail', id] })
      qc.invalidateQueries({ queryKey: ['pending-timesheets'] })
      toast.success('อนุมัติ Timesheet แล้ว')
    },
    onError: (err: Error) => toast.error('เกิดข้อผิดพลาด', err.message),
  })
}

export function useRejectTimesheet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, rejection_reason }: { id: string; rejection_reason: string }) => {
      const res  = await fetch(`/api/timesheet/${id}/reject`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rejection_reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json.data
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['timesheet-detail', id] })
      qc.invalidateQueries({ queryKey: ['pending-timesheets'] })
      toast.success('ส่งคืน Timesheet แล้ว')
    },
    onError: (err: Error) => toast.error('เกิดข้อผิดพลาด', err.message),
  })
}
