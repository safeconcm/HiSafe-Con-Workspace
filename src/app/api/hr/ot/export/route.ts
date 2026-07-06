// src/app/api/hr/ot/export/route.ts
// GET /api/hr/ot/export?year=2026&month=6
// Export OT data as CSV for HR

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'

const OT_TYPE_LABEL: Record<string, string> = {
  weekday: 'วันธรรมดา', weekend: 'วันหยุดสุดสัปดาห์', holiday: 'วันหยุดนักขัตฤกษ์',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง', pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก',
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year  = searchParams.get('year') ?? String(new Date().getFullYear())
  const month = searchParams.get('month')

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('ot_requests')
    .select(`
      *,
      user:users!ot_requests_user_id_fkey(
        employee_code, first_name_th, last_name_th, department, position_th
      ),
      job:jobs(job_code, name_th)
    `)
    .eq('company_id', session.company_id)
    .gte('ot_date', `${year}-01-01`)
    .lte('ot_date', `${year}-12-31`)
    .order('ot_date', { ascending: true })
    .limit(5000)

  if (month) {
    const m = String(month).padStart(2, '0')
    query = query
      .gte('ot_date', `${year}-${m}-01`)
      .lte('ot_date', `${year}-${m}-31`)
  }

  const { data, error } = await query
  if (error) return serverError(error)

  const BOM     = '\uFEFF'
  const headers = [
    'รหัสพนักงาน','ชื่อ-สกุล','แผนก','ตำแหน่ง',
    'วันที่ OT','ประเภทวัน','เวลาเริ่ม','เวลาสิ้นสุด','ชั่วโมง',
    'Job Code','ชื่องาน','เหตุผล','สถานะ',
  ]

  const rows = (data ?? []).map((r: any) => [
    r.user?.employee_code ?? '',
    `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
    r.user?.department  ?? '',
    r.user?.position_th ?? '',
    r.ot_date,
    OT_TYPE_LABEL[r.ot_type] ?? r.ot_type,
    r.start_time,
    r.end_time,
    r.total_hours,
    r.job?.job_code ?? '',
    r.job?.name_th  ?? '',
    (r.reason ?? '').replace(/,/g, '،'),
    STATUS_LABEL[r.status] ?? r.status,
  ])

  const csv = BOM + [headers, ...rows]
    .map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const filename = month
    ? `ot-report-${year}-${String(month).padStart(2,'0')}.csv`
    : `ot-report-${year}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
