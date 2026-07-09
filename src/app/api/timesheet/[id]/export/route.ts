// src/app/api/timesheet/[id]/export/route.ts
// GET /api/timesheet/:id/export?format=xlsx|csv
// Per-employee Excel/CSV export of ONE month's timesheet, mirroring the
// same job (rows) x date (columns) matrix used by the PDF
// (src/lib/pdf/timesheet-template.ts) — this is deliberately a separate,
// smaller export from the existing HR-wide /api/export?type=timesheet
// (which is a one-row-per-employee-per-month roster summary, not a
// per-job breakdown). Same auth/data-fetching pattern as
// src/app/api/pdf/timesheet/[id]/route.ts.
//
// The .xlsx output is built with ExcelJS (not the hand-rolled writer in
// src/lib/xlsx-export.ts) so it can carry real styling — borders, header
// fill, weekend/holiday column shading, frozen panes, fit-to-1-page-wide
// print setup — to visually match the PDF matrix. ExcelJS is pure JS (no
// native binary), so it doesn't add any Vercel build risk the way a
// native-binding package would. CSV stays on the old plain-text writer:
// CSV has no concept of cell styling, so it just carries the same data.

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound, badRequest,
} from '@/lib/api-helpers'
import { buildCSV } from '@/lib/xlsx-export'

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const TH_DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส']

const BORDER_COLOR = 'FFD1D5DB'
const THIN = { style: 'thin' as const, color: { argb: BORDER_COLOR } }
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN }

const FILL_HEADER   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1E3A8A' } }
const FILL_HEADER_WEEKEND = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF33448A' } }
const FILL_HEADER_HOLIDAY = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF7A2020' } }
const FILL_WEEKEND  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } }
const FILL_HOLIDAY  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF2F2' } }
const FILL_LEAVE    = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0FDF4' } }
const FILL_TOTAL    = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') ?? 'xlsx'
  if (!['xlsx', 'csv'].includes(format)) return badRequest('format must be xlsx or csv')

  const supabase = createAdminSupabaseClient()

  const { data: ts, error } = await supabase
    .from('timesheets')
    .select(`
      *,
      user:users!timesheets_user_id_fkey(
        employee_code, first_name_th, last_name_th, position_th, department
      ),
      lines:timesheet_lines(
        work_date, hours, line_type, remark,
        job:jobs(job_code, name_th)
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !ts) return notFound('Timesheet')
  if (session.role === 'employee' && ts.user_id !== session.id) return forbidden()

  const monthPad = String(ts.month).padStart(2, '0')
  const daysInMonth = new Date(ts.year, ts.month, 0).getDate()
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Holidays for this month — same source as the PDF template, needed to
  // shade holiday columns the same way the PDF does.
  const { data: holidays } = await supabase
    .from('holidays')
    .select('holiday_date, name_th')
    .eq('company_id', session.company_id)
    .gte('holiday_date', `${ts.year}-${monthPad}-01`)
    .lte('holiday_date', `${ts.year}-${monthPad}-31`)
    .eq('is_active', true)
  const holidayMap = new Map<string, string>()
  ;(holidays ?? []).forEach((h: any) => holidayMap.set(h.holiday_date, h.name_th))

  const weekendDays  = new Set<number>()
  const holidayDays  = new Set<number>()
  dayNumbers.forEach(d => {
    const date = new Date(ts.year, ts.month - 1, d)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) weekendDays.add(d)
    const dateStr = date.toISOString().split('T')[0]
    if (holidayMap.has(dateStr)) holidayDays.add(d)
  })

  const lines = (ts.lines as any[]) ?? []
  const workLines  = lines.filter(l => l.line_type === 'work')
  const leaveLines = lines.filter(l => l.line_type === 'leave')

  // Row per job: job code/name -> (day-of-month -> hours) + running total.
  const jobRows = new Map<string, { code: string; name: string; hoursByDay: Map<number, number>; total: number }>()
  workLines.forEach(l => {
    if (!l.job) return
    const key = l.job.job_code
    const row = jobRows.get(key) ?? { code: l.job.job_code, name: l.job.name_th, hoursByDay: new Map(), total: 0 }
    const day = new Date(l.work_date).getDate()
    row.hoursByDay.set(day, (row.hoursByDay.get(day) ?? 0) + l.hours)
    row.total += l.hours
    jobRows.set(key, row)
  })

  const leaveByDay = new Map<number, number>()
  let leaveTotal = 0
  leaveLines.forEach(l => {
    const day = new Date(l.work_date).getDate()
    leaveByDay.set(day, (leaveByDay.get(day) ?? 0) + l.hours)
    leaveTotal += l.hours
  })

  const dayTotals = new Map<number, number>()
  jobRows.forEach(row => row.hoursByDay.forEach((h, day) => dayTotals.set(day, (dayTotals.get(day) ?? 0) + h)))
  leaveByDay.forEach((h, day) => dayTotals.set(day, (dayTotals.get(day) ?? 0) + h))

  const sortedJobs = Array.from(jobRows.values()).sort((a, b) => a.code.localeCompare(b.code))

  const user = ts.user as any
  const statusTh: Record<string, string> = { draft: 'ร่าง', submitted: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ตีกลับ' }
  const employeeName = `${user?.first_name_th ?? ''} ${user?.last_name_th ?? ''}`.trim()
  const filename = `timesheet-${user?.employee_code ?? params.id}-${ts.year}-${monthPad}`

  // ── CSV: plain data, no styling possible in the format ─────────────
  if (format === 'csv') {
    const headerRow: (string | number)[] = ['Job code', 'ชื่องาน', ...dayNumbers, 'รวม']
    const rows: (string | number | null)[][] = []
    sortedJobs.forEach(row => {
      rows.push([row.code, row.name, ...dayNumbers.map(d => row.hoursByDay.get(d) ?? null), row.total])
    })
    if (leaveLines.length > 0) {
      rows.push(['—', 'ลา', ...dayNumbers.map(d => leaveByDay.get(d) ?? null), leaveTotal])
    }
    rows.push(['', 'รวมชั่วโมง/วัน', ...dayNumbers.map(d => dayTotals.get(d) ?? null), ts.total_hours])

    const csv = buildCSV(headerRow, rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }

  // ── XLSX: styled matrix matching the PDF layout ────────────────────
  const totalCols = 2 + daysInMonth + 1 // Job code, ชื่องาน, ...days, รวม

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Timesheet', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
    },
  })

  worksheet.columns = [
    { width: 12 },
    { width: 22 },
    ...dayNumbers.map(() => ({ width: 4 })),
    { width: 10 },
  ]

  // Row 1: title (merged across the whole width)
  const titleRow = worksheet.addRow([`Timesheet รายเดือน — ${TH_MONTHS[ts.month - 1]} ${ts.year + 543}`])
  worksheet.mergeCells(1, 1, 1, totalCols)
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } }
  titleRow.getCell(1).alignment = { horizontal: 'center' }
  titleRow.height = 22

  // Row 2: employee info
  const infoRow = worksheet.addRow([
    'รหัสพนักงาน', user?.employee_code ?? '',
    'ชื่อ-นามสกุล', employeeName,
    'แผนก', user?.department ?? '',
    'สถานะ', statusTh[ts.status] ?? ts.status,
  ])
  ;[1, 3, 5, 7].forEach(c => { infoRow.getCell(c).font = { bold: true } })

  // Row 3: blank spacer
  worksheet.addRow([])

  // Row 4: matrix header
  const headerLabels: (string | number)[] = [
    'Job code', 'ชื่องาน',
    ...dayNumbers.map(d => {
      const date = new Date(ts.year, ts.month - 1, d)
      return `${d}(${TH_DAYS[date.getDay()]})`
    }),
    'รวม',
  ]
  const headerRow = worksheet.addRow(headerLabels)
  headerRow.height = 26
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = FILL_HEADER
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER_ALL
    if (colNumber >= 3 && colNumber <= 2 + daysInMonth) {
      const d = colNumber - 2
      if (holidayDays.has(d)) cell.fill = FILL_HEADER_HOLIDAY
      else if (weekendDays.has(d)) cell.fill = FILL_HEADER_WEEKEND
    }
  })

  const shadeDataCell = (cell: ExcelJS.Cell, colNumber: number) => {
    cell.border = BORDER_ALL
    if (colNumber >= 3 && colNumber <= 2 + daysInMonth) {
      const d = colNumber - 2
      if (holidayDays.has(d)) cell.fill = FILL_HOLIDAY
      else if (weekendDays.has(d)) cell.fill = FILL_WEEKEND
    }
  }

  // Job rows
  sortedJobs.forEach(row => {
    const r = worksheet.addRow([
      row.code, row.name,
      ...dayNumbers.map(d => row.hoursByDay.get(d) ?? null),
      row.total,
    ])
    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      shadeDataCell(cell, colNumber)
      if (colNumber === 1) cell.font = { bold: true, color: { argb: 'FF1E3A8A' } }
      if (colNumber === totalCols) cell.font = { bold: true, color: { argb: 'FF1E3A8A' } }
    })
  })

  // Leave row
  if (leaveLines.length > 0) {
    const r = worksheet.addRow([
      '—', 'ลา',
      ...dayNumbers.map(d => leaveByDay.get(d) ?? null),
      leaveTotal,
    ])
    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = BORDER_ALL
      cell.fill = FILL_LEAVE
      cell.font = { color: { argb: 'FF16A34A' }, bold: colNumber === 2 }
    })
  }

  // Total row
  const totalRow = worksheet.addRow([
    '', 'รวมชั่วโมง/วัน',
    ...dayNumbers.map(d => dayTotals.get(d) ?? null),
    ts.total_hours,
  ])
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = BORDER_ALL
    cell.fill = FILL_TOTAL
    cell.font = { bold: true, color: { argb: 'FF1E3A8A' } }
  })

  const buf = Buffer.from(await workbook.xlsx.writeBuffer())
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new NextResponse(arrayBuf as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  })
}
