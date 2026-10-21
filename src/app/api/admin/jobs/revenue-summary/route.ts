// src/app/api/admin/jobs/revenue-summary/route.ts
// GET /api/admin/jobs/revenue-summary — ยอดรายได้แต่ละปี และยอดรวมทั้งหมด
// (2026-10-21, "Job Codes ต้องมีให้เพิ่มมูลค่างานด้วยจะดีมาก จะได้ยอดรายได้
// แต่ละปี และยอดรวมทั้งหมด"). Deliberately NOT scoped to the single `year`
// the Jobs page's dropdown happens to be on — that dropdown only offers the
// last 4 years (src/app/access/jobs/page.tsx's `years` array), but a grand
// total has to cover every year a Job was ever entered, so this pulls every
// row for the company regardless of year/status and aggregates in JS rather
// than relying on Supabase-JS's lack of a GROUP BY — the jobs table is small
// (tens to low hundreds of rows per company), so this is cheap.
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, createAdminSupabaseClient, ok, unauthorized, serverError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('year, contract_value')
    .eq('company_id', session.company_id)

  if (error) return serverError(error)

  const byYearMap = new Map<number, number>()
  let total = 0
  let countWithValue = 0

  for (const row of data ?? []) {
    const v = row.contract_value
    if (v === null || v === undefined) continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    countWithValue++
    total += n
    byYearMap.set(row.year, (byYearMap.get(row.year) ?? 0) + n)
  }

  const byYear = Array.from(byYearMap.entries())
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => b.year - a.year)

  return ok({ byYear, total, countWithValue, countTotal: (data ?? []).length })
}
