// src/utils/index.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { th } from 'date-fns/locale'
import type { LeaveType, LeaveStatus, TimesheetStatus, UserRole, JobStatus } from '@/types/database'

// ── Tailwind class helper ────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date formatting ──────────────────────────────────────────

export function formatDateTH(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  return format(d, 'd MMM yyyy', { locale: th })
}

export function formatDateRangeTH(start: string, end: string): string {
  if (start === end) return formatDateTH(start)
  return `${formatDateTH(start)} – ${formatDateTH(end)}`
}

export function formatMonthYearTH(year: number, month: number): string {
  const d = new Date(year, month - 1, 1)
  return format(d, 'MMMM yyyy', { locale: th })
}

export function formatDateTime(dateStr: string): string {
  return format(parseISO(dateStr), 'd MMM yyyy HH:mm', { locale: th })
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const date = new Date(year, month - 1, 1)
  while (date.getMonth() === month - 1) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

// ── Leave type labels ────────────────────────────────────────

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual:    'พักร้อน',
  sick:      'ลาป่วย',
  personal:  'ลากิจ',
  maternity: 'ลาคลอด',
  other:     'อื่นๆ',
}

export const LEAVE_TYPE_COLOR: Record<LeaveType, string> = {
  annual:    'bg-blue-100 text-blue-800',
  sick:      'bg-red-100 text-red-800',
  personal:  'bg-amber-100 text-amber-800',
  maternity: 'bg-pink-100 text-pink-800',
  other:     'bg-gray-100 text-gray-800',
}

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  draft:          'ร่าง',
  pending:        'รออนุมัติ',
  approved:       'อนุมัติแล้ว',
  rejected:       'ไม่อนุมัติ',
  cancelled:      'ยกเลิกแล้ว',
  cancel_pending: 'รอยกเลิก',
}

export const LEAVE_STATUS_COLOR: Record<LeaveStatus, string> = {
  draft:          'bg-gray-100 text-gray-600',
  pending:        'bg-amber-100 text-amber-800',
  approved:       'bg-green-100 text-green-800',
  rejected:       'bg-red-100 text-red-800',
  cancelled:      'bg-gray-100 text-gray-500',
  cancel_pending: 'bg-orange-100 text-orange-800',
}

// ── Timesheet labels ─────────────────────────────────────────

export const TIMESHEET_STATUS_LABEL: Record<TimesheetStatus, string> = {
  draft:     'ร่าง',
  submitted: 'รออนุมัติ',
  approved:  'อนุมัติแล้ว',
  rejected:  'ไม่อนุมัติ',
}

export const TIMESHEET_STATUS_COLOR: Record<TimesheetStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-amber-100 text-amber-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-red-100 text-red-800',
}

// ── Role labels ──────────────────────────────────────────────

export const ROLE_LABEL: Record<UserRole, string> = {
  employee:   'พนักงาน',
  supervisor: 'หัวหน้างาน',
  hr:         'HR',
  admin:      'ผู้ดูแลระบบ',
}

// ── Job labels ───────────────────────────────────────────────

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  active:   'เปิดใช้งาน',
  inactive: 'พักไว้',
  closed:   'ปิดแล้ว',
}

// ── Number helpers ───────────────────────────────────────────

export function formatDays(days: number): string {
  if (days === 0.5) return '0.5 วัน'
  return `${days} วัน`
}

export function formatHours(hours: number): string {
  return `${hours} ชม.`
}

// ── Full name helpers ────────────────────────────────────────

export function fullNameTH(user: { first_name_th: string; last_name_th: string }): string {
  return `${user.first_name_th} ${user.last_name_th}`
}

// ── Timesheet month helpers ──────────────────────────────────

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function monthName(month: number): string {
  return format(new Date(2024, month - 1, 1), 'MMMM', { locale: th })
}
