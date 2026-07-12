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

// ── Announcement body formatting (markdown-lite) ─────────────
// Deliberately minimal — not a general markdown parser. Supports just what
// was asked for: **bold**, ==highlight==, "- " bullet lists, "1. " numbered
// lists, and line breaks. Added 2026-07-12 as the "try the easy way first"
// option (vs. a full rich-text editor) for HR announcement bodies, which
// are still typed in a plain textarea — no new UI, HR just types the
// syntax. Escaping happens first so the body text itself can never inject
// arbitrary HTML/script; only our own fixed-pattern tags are added after.
function escapeForMarkdown(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdownInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/==(.+?)==/g, '<mark style="background:#fef08a;padding:0 2px;">$1</mark>')
}

export function renderAnnouncementBody(text: string): string {
  const lines = escapeForMarkdown(text).split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null }
  }
  for (const line of lines) {
    const bullet = line.match(/^-\s+(.*)/)
    const numbered = line.match(/^\d+\.\s+(.*)/)
    if (bullet) {
      if (listType !== 'ul') { closeList(); out.push('<ul style="margin:4px 0;padding-left:20px;">'); listType = 'ul' }
      out.push(`<li>${renderMarkdownInline(bullet[1])}</li>`)
    } else if (numbered) {
      if (listType !== 'ol') { closeList(); out.push('<ol style="margin:4px 0;padding-left:20px;">'); listType = 'ol' }
      out.push(`<li>${renderMarkdownInline(numbered[1])}</li>`)
    } else {
      closeList()
      out.push(line === '' ? '<br/>' : `<p style="margin:0 0 4px;">${renderMarkdownInline(line)}</p>`)
    }
  }
  closeList()
  return out.join('')
}

// For plain-text contexts that can't render HTML (LINE messages, collapsed
// list previews) — strips the same markers instead of showing them raw.
export function stripAnnouncementMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1')
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

// Compact Buddhist-era date (e.g. "22/7/69") for places with a hard
// character budget — currently the LINE Buttons-template card text (≤60
// chars, see sendLineMessage in lib/line.ts). Kept separate from
// formatDateTH above (which uses date-fns' 'th' locale and stays Gregorian)
// since the rest of the app shows Buddhist year via manual +543 in the PDF
// templates — matching that convention here instead of introducing a third
// date style. Format and always-show-both-dates (even same-day) requested
// by the user directly, e.g. "22/7/69-22/7/69" for a single-day leave.
export function formatDateSlashTH(dateStr: string): string {
  const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  return `${d.getDate()}/${d.getMonth() + 1}/${(d.getFullYear() + 543) % 100}`
}

export function formatDateRangeSlashTH(start: string, end: string): string {
  return `${formatDateSlashTH(start)}-${formatDateSlashTH(end)}`
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
