// src/app/api/payroll/route.ts
// GET /api/payroll?year=&month= — wage breakdown per employee per job code,
// computed from approved timesheets.
// - hr/admin: whole-company view (unchanged).
// - supervisor: scoped to their direct reports only, via the existing
//   organization_nodes tree (the same parent/child structure find_approver()
//   already walks for leave/OT approvals) — no new schema needed, since
//   every employee already has a node with a parent_id.
// employee role still gets no access at all (this is compensation data).

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromHeaders, createAdminSupabaseClient, ok, badRequest, unauthorized, forbidden } from '@/lib/api-helpers'
import { computePayroll, computeJobCostSummary } from '@/lib/payroll'

function toCSV(rows: (string | number | null)[][]): string {
  const BOM = '﻿'
  return BOM + rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!['hr', 'admin', 'supervisor'].includes(session.role)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()))
  const format = searchParams.get('format')
  // group=job (2026-10-16, per request: "ค่าแรง/payroll ต้องเป็น Job Direct
  // Cost summary รายเดือน รายปี ตาม Job") — "cost per Job Code across every
  // employee" instead of "cost per employee across their jobs". Since
  // 2026-10-19 this no longer shares computePayroll()'s calendar-month data
  // — computeJobCostSummary pulls timesheet_lines by real work_date over
  // the company's actual pay cycle (26th of the previous month through the
  // 25th of this one), not the calendar month. `month` here still means
  // "which cycle, labelled by the month its 25th falls in" — see
  // cyclePeriod() in src/lib/payroll.ts. period=year aggregates all 12
  // cycles instead of a single one.
  if (searchParams.get('group') === 'job') {
    const period = searchParams.get('period') === 'year' ? 'year' : 'month'
    const month  = period === 'year' ? undefined : parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
    if (month !== undefined && (month < 1 || month > 12)) return badRequest('month ต้องอยู่ระหว่าง 1-12')

    const jobRows = await computeJobCostSummary(session.company_id, year, month)

    if (format === 'csv') {
      const header = ['Job Code', 'ชื่องาน', 'จำนวนพนักงาน', 'ชั่วโมงรวม', 'ต้นทุนรวม (บาท)']
      const csvRows: (string | number | null)[][] = [header]
      for (const j of jobRows) csvRows.push([j.job_code, j.job_name, j.employee_count, j.hours, j.cost])
      return new NextResponse(toCSV(csvRows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="job-cost-${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.csv"`,
        },
      })
    }

    return ok({ year, month: month ?? null, period, rows: jobRows })
  }

  const month  = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  if (month < 1 || month > 12) return badRequest('month ต้องอยู่ระหว่าง 1-12')

  let userIds: string[] | undefined
  if (session.role === 'supervisor') {
    const supabase = createAdminSupabaseClient()
    const { data: myNode } = await supabase
      .from('organization_nodes').select('id')
      .eq('user_id', session.id).eq('is_active', true).maybeSingle()
    const { data: reports } = myNode
      ? await supabase.from('organization_nodes').select('user_id')
          .eq('parent_id', myNode.id).eq('is_active', true)
      : { data: [] }
    userIds = (reports ?? []).map((r: any) => r.user_id)
  }

  const rows = await computePayroll(session.company_id, year, month, userIds ? { userIds } : undefined)

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
