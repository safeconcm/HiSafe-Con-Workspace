// src/app/api/payroll/route.ts
// GET /api/payroll?year=&month= — wage breakdown per employee per job code,
// computed from approved timesheets. Visible to hr/admin only — salary data
// for the whole company, and there is no per-supervisor team scoping in the
// schema (no manager_id/reports-to relation), so supervisor access was
// removed rather than exposing every employee's pay to every supervisor.
// If a future "my team's payroll" view is wanted, that needs a proper
// reporting-line field first — see the 2026-07 access-control discussion.

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromHeaders, ok, badRequest, unauthorized, forbidden } from '@/lib/api-helpers'
import { computePayroll } from '@/lib/payroll'

function toCSV(rows: (string | number | null)[][]): string {
  const BOM = '﻿'
  return BOM + rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!['hr', 'admin'].includes(session.role)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const month  = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const format = searchParams.get('format')
  if (month < 1 || month > 12) return badRequest('month ต้องอยู่ระหว่าง 1-12')

  const rows = await computePayroll(session.company_id, year, month)

  if (format === 'csv') {
    const header = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'แผนก', 'Job Code', 'ชื่องาน', 'ชั่วโมง', 'อัตรา/ชม.', 'ค่าแรง (บาท)']
    const csvRows: (string | number | null)[][] = [header]
    for (const r of rows) {
      for (const j of r.jobs) {
        csvRows.push([r.employee_code, r.name, r.department, j.job_code, j.job_name, j.hours, r.hourly_rate, j.cost])
      }
      if (r.unpaid_leave_days > 0) {
        csvRows.push([r.employee_code, r.name, r.department, '-', 'หักลา (ทดลองงาน ไม่มีสิทธิ์รับค่าจ้าง)', r.unpaid_leave_days * 8, r.hourly_rate, -r.unpaid_deduction])
      }
      csvRows.push([r.employee_code, r.name, r.department, '', 'รวมสุทธิ', r.total_hours, '', r.net_pay])
    }
    return new NextResponse(toCSV(csvRows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payroll-${year}-${String(month).padStart(2, '0')}.csv"`,
      },
    })
  }

  return ok({ year, month, rows })
}
