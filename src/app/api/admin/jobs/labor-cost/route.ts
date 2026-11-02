// src/app/api/admin/jobs/labor-cost/route.ts
// GET /api/admin/jobs/labor-cost — life-to-date Staff labor cost per Job
// Code (2026-11-02, "เพิ่มการคิดค่าใช้จ่ายค่าแรง staff ตาม Job" for the
// CONNEX Inside Job Codes tab). Admin-only, matching CONNEX Inside's own
// access level — reuses the exact same per-cycle rate math as the existing
// Job Direct Cost report (src/lib/payroll.ts), just summed across every
// pay cycle that has ever had an approved Timesheet instead of one year.
//
// Single-company (the admin's currently active company, via session.company_id
// / ACTIVE_COMPANY_COOKIE) — not merged across a cross-company grant, same
// precedent as the Headcount/Payroll tab and computeJobCostSummary's own
// comment on why labor-cost aggregation stays per-company.
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, ok, unauthorized, forbidden } from '@/lib/api-helpers'
import { computeJobCostAllTime } from '@/lib/payroll'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                 return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const rows = await computeJobCostAllTime(session.company_id)
  return ok({ rows })
}
