// src/app/api/timesheet/[id]/export/route.ts
// GET /api/timesheet/:id/export?format=xlsx|csv
// Per-employee Excel/CSV export of ONE month's timesheet, mirroring the
// same job (rows) x date (columns) matrix used by the PDF
// (src/lib/pdf/timesheet-template.ts) — this is deliberately a separate,
// smaller export from the existing HR-wide /api/export?type=timesheet
// (which is a one-row-per-employee-per-month roster summary, not a
// per-job breakdown). Same auth/data-fetching pattern as
// src/app/api/pdf/timesheet/[id]/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound, badRequest,
} from '@/lib/api-helpers'
import { buildXLSX, buildCSV } from '@/lib/xlsx-export'

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

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

  // Column header row (also the `headers` arg the xlsx/csv writers expect)
  const matrixHeader: (string | number)[] = ['Job code', 'ชื่องาน', ...dayNumbers, 'รวม']

  const rows: (string | number | null)[][] = []

  // Info block above the matrix
  rows.push([`Timesheet รายเดือน — ${TH_MONTHS[ts.month - 1]} ${ts.year + 543}`])
  rows.push(['รหัสพนักงาน', user?.employee_code ?? '', 'ชื่อ-นามสกุล', `${user?.first_name_th ?? ''} ${user?.last_name_th ?? ''}`.trim()])
  rows.push(['แผนก', user?.department ?? '', 'สถานะ', statusTh[ts.status] ?? ts.status])
  rows.push([]) // blank spacer row

  // Matrix "header" as a data row (this simple writer has no per-row styling anyway)
  rows.push(matrixHeader)

  sortedJobs.forEach(row => {
    rows.push([row.code, row.name, ...dayNumbers.map(d => row.hoursByDay.get(d) ?? null), row.total])
  })

  if (leaveLines.length > 0) {
    rows.push(['—', 'ลา', ...dayNumbers.map(d => leaveByDay.get(d) ?? null), leaveTotal])
  }

  rows.push(['', 'รวมชั่วโมง/วัน', ...dayNumbers.map(d => dayTotals.get(d) ?? null), ts.total_hours])

  const filename = `timesheet-${user?.employee_code ?? params.id}-${ts.year}-${monthPad}`

  // rows[0] is the title row — use it as the "headers" arg so we don't
  // end up with a wasted blank first row (buildXLSX/buildCSV prepend
  // `headers` as row 1 and then serialize `rows` after it).
  const [firstRow, ...restRows] = rows

  if (format === 'xlsx') {
    const buf = buildXLSX(firstRow, restRows)
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return new NextResponse(arrayBuf as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    })
  } else {
    const csv = buildCSV(firstRow, restRows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }
}
