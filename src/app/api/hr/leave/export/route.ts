// src/app/api/hr/leave/export/route.ts
// GET /api/hr/leave/export?format=excel&year=2026
// Returns leave data as CSV (Excel-compatible UTF-8 BOM)

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'
import { LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL, formatDateTH } from '@/utils'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)          return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year       = searchParams.get('year') ?? String(new Date().getFullYear())
  const status     = searchParams.get('status')
  const leave_type = searchParams.get('leave_type')

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(
        employee_code, first_name_th, last_name_th, department, position_th
      )
    `)
    .eq('company_id', session.company_id)
    .gte('start_date', `${year}-01-01`)
    .lte('end_date',   `${year}-12-31`)
    .order('start_date', { ascending: false })
    .limit(5000)

  if (status)     query = query.eq('status', status)
  if (leave_type) query = query.eq('leave_type', leave_type)

  const { data, error } = await query
  if (error) return serverError(error)

  // Build CSV
  const BOM = '\uFEFF'   // UTF-8 BOM for Excel Thai support
  const headers = [
    'รหัสพนักงาน', 'ชื่อ-สกุล', 'แผนก', 'ตำแหน่ง',
    'ประเภทลา', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'จำนวนวัน',
    'ครึ่งวัน', 'สถานะ', 'เหตุผล', 'วันที่ยื่น',
  ]

  const rows = (data ?? []).map((r: any) => [
    r.user?.employee_code ?? '',
    `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
    r.user?.department  ?? '',
    r.user?.position_th ?? '',
    LEAVE_TYPE_LABEL[r.leave_type as keyof typeof LEAVE_TYPE_LABEL] ?? r.leave_type,
    r.start_date,
    r.end_date,
    r.total_days,
    r.is_half_day ? (r.half_day_period === 'morning' ? 'เช้า' : 'บ่าย') : '',
    LEAVE_STATUS_LABEL[r.status as keyof typeof LEAVE_STATUS_LABEL] ?? r.status,
    (r.reason ?? '').replace(/,/g, '،'),
    r.created_at.split('T')[0],
  ])

  const csv = BOM + [headers, ...rows]
    .map((row: (string|number)[]) => row.map((cell: string|number) => `"${cell}"`).join(','))
    .join('\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leave-report-${year}.csv"`,
    },
  })
}
