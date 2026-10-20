// src/app/api/cost-centers/route.ts
// GET /api/cost-centers?year=&month=&period= — hours/cost breakdown per
// Activity Code ("Cost Center"), computed from approved Timesheets.
// 2026-10-20, per request: "Time sheet ช่องให้เลือก Activity code ... ดึง
// ข้อมูลไปสร้าง Tab ... Cost Centers ... ทั้ง 11 รูป", moved here the same
// day from src/app/api/access/cost-centers/route.ts after a follow-up
// request ("ย้าย Cost Centers ให้ HR ดู Tab HR ... เพราะ Payroll job cost
// จะอยู่ด้วยกัน") — the page that calls this now lives at
// src/app/(dashboard)/payroll/cost-centers/page.tsx, next to Job Direct Cost
// (src/app/(dashboard)/payroll/page.tsx, calling /api/payroll?group=job),
// so this route moved out of /api/access to sit next to /api/payroll
// instead, matching its new page's location.
//
// Mirrors /api/payroll?group=job's shape closely (same cyclePeriod/
// cross-company-grant handling — see that route's own comments for the
// pay-cycle reasoning), but keyed by activity_code via
// computeCostCenterSummary() instead of job_id via computeJobCostSummary().
//
// Admin + HR only (per request: "ใครควรเห็น Tab นี้ได้บ้าง — Admin + HR/
// บัญชี") — same role list as before the move, just no longer paired with
// an /access-specific middleware/layout exception, since the page itself
// isn't under /access anymore (see src/app/(dashboard)/payroll/cost-centers/
// page.tsx's own comment on why no middleware route guard is needed here,
// same convention as /api/payroll).
import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, ok, badRequest, unauthorized, forbidden,
  isHROrAdmin, getAccessibleCompanyIds,
} from '@/lib/api-helpers'
import { computeCostCenterSummary, type CostCenterSummaryLine } from '@/lib/payroll'

function toCSV(rows: (string | number | null)[][]): string {
  const BOM = '﻿'
  return BOM + rows.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!['hr', 'admin'].includes(session.role)) return forbidden()

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const period = searchParams.get('period') === 'year' ? 'year' : 'month'
  const month  = period === 'year' ? undefined : parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const format = searchParams.get('format')

  if (month !== undefined && (month < 1 || month > 12)) return badRequest('month ต้องอยู่ระหว่าง 1-12')

  // Cross-company read grant (same pattern as /api/payroll?group=job) —
  // HR/Admin with a grant get one call per accessible company, merged here
  // by activity_code key.
  const companyIds = isHROrAdmin(session) ? await getAccessibleCompanyIds(session) : [session.company_id]
  const rowsByCompany = await Promise.all(companyIds.map(cid => computeCostCenterSummary(cid, year, month)))

  const codeMap = new Map<string, CostCenterSummaryLine>()
  for (const companyRows of rowsByCompany) {
    for (const r of companyRows) {
      const existing = codeMap.get(r.activity_code)
      if (existing) {
        existing.hours += r.hours
        existing.cost = Math.round((existing.cost + r.cost) * 100) / 100
        existing.employee_count += r.employee_count
        for (const j of r.jobs) {
          const existingJob = existing.jobs.find(x => (x.job_id ?? x.job_code) === (j.job_id ?? j.job_code))
          if (existingJob) {
            existingJob.hours += j.hours
            existingJob.cost = Math.round((existingJob.cost + j.cost) * 100) / 100
          } else {
            existing.jobs.push({ ...j })
          }
        }
        existing.jobs.sort((a, b) => b.cost - a.cost)
      } else {
        codeMap.set(r.activity_code, { ...r, jobs: [...r.jobs] })
      }
    }
  }
  const rows = Array.from(codeMap.values()).sort((a, b) => {
    if (a.activity_code === 'unclassified') return 1
    if (b.activity_code === 'unclassified') return -1
    return b.cost - a.cost
  })

  if (format === 'csv') {
    const header = ['Activity Code', 'ชื่อกิจกรรม', 'จำนวนพนักงาน', 'ชั่วโมงรวม', 'ต้นทุนรวม (บาท)']
    const csvRows: (string | number | null)[][] = [header]
    for (const r of rows) csvRows.push([r.activity_code === 'unclassified' ? '-' : r.activity_code, r.activity_label, r.employee_count, r.hours, r.cost])
    return new NextResponse(toCSV(csvRows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cost-centers-${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.csv"`,
      },
    })
  }

  return ok({ year, month: month ?? null, period, rows })
}
