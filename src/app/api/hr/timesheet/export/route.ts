// src/app/api/hr/timesheet/export/route.ts
// GET /api/hr/timesheet/export?year=2026&month=6&format=csv

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'
import { TIMESHEET_STATUS_LABEL } from '@/utils'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year  = searchParams.get('year')  ?? String(new Date().getFullYear())
  const month = searchParams.get('month')

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('timesheets')
    .select(`
      year, month, status, total_hours, approved_at,
      user:users!timesheets_user_id_fkey(
        employee_code, first_name_th, last_name_th, department, position_th
      ),
      lines:timesheet_lines(work_date, hours, line_type, job:jobs(job_code, name_th))
    `)
    .eq('company_id', session.company_id)
    .eq('year', parseInt(year))
    .order('month', { ascending: true })
    .limit(2000)

  if (month) query = query.eq('month', parseInt(month))

  const { data, error } = await query
  if (error) return serverError(error)

  // Build detailed CSV — one row per timesheet line
  const BOM = '\uFEFF'
  const headers = [
    'รหัสพนักงาน', 'ชื่อ-สกุล', 'แผนก', 'ตำแหน่ง',
    'ปี', 'เดือน', 'วันที่', 'Job Code', 'ชื่องาน',
    'ชั่วโมง', 'ประเภท', 'สถานะ Timesheet', 'รวมชั่วโมง/เดือน',
  ]

  const rows: (string | number)[][] = []

  for (const ts of data ?? []) {
    const u = (ts as any).user
    const lines = (ts as any).lines ?? []

    if (!lines.length) {
      rows.push([
        u?.employee_code ?? '', `${u?.first_name_th ?? ''} ${u?.last_name_th ?? ''}`.trim(),
        u?.department ?? '', u?.position_th ?? '',
        ts.year, ts.month, '', '', '', 0, '',
        TIMESHEET_STATUS_LABEL[(ts.status as keyof typeof TIMESHEET_STATUS_LABEL)] ?? ts.status,
        ts.total_hours,
      ])
      continue
    }

    for (const line of lines.filter((l: any) => l.line_type === 'work')) {
      rows.push([
        u?.employee_code ?? '', `${u?.first_name_th ?? ''} ${u?.last_name_th ?? ''}`.trim(),
        u?.department ?? '', u?.position_th ?? '',
        ts.year, ts.month, line.work_date,
        (line.job as any)?.job_code ?? '', (line.job as any)?.name_th ?? '',
        line.hours, 'งาน',
        TIMESHEET_STATUS_LABEL[(ts.status as keyof typeof TIMESHEET_STATUS_LABEL)] ?? ts.status,
        ts.total_hours,
      ])
    }
  }

  const csv = BOM + [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const filename = month
    ? `timesheet-${year}-${String(month).padStart(2, '0')}.csv`
    : `timesheet-${year}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
