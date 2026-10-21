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
//
// 2026-10-22 ("เมื่อรู้มูลค่างานก็รวมสรุปทั้งหมด แยกปี แยกผู้ว่าจ้างด้วย
// เปรียบเทียบปี เพิ่มขึ้น หรือลดลง ทำกราฟด้วย"): extended to also break down
// by client (ผู้ว่าจ้าง), and each year now carries a year-over-year delta
// against the immediately preceding calendar year (only when that year is
// itself present in the data — a gap year means "no comparison", not "0").
// The chart itself is built client-side (src/app/access/jobs/revenue/page.tsx)
// from this same byYear/byClient data, so the numbers never disagree.
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, createAdminSupabaseClient, ok, unauthorized, serverError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('year, contract_value, client_name')
    .eq('company_id', session.company_id)

  if (error) return serverError(error)

  const byYearMap   = new Map<number, number>()
  const byYearCount = new Map<number, number>()
  const byClientMap   = new Map<string, number>()
  const byClientCount = new Map<string, number>()
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
    byYearCount.set(row.year, (byYearCount.get(row.year) ?? 0) + 1)

    const client = row.client_name?.trim() || 'ไม่ระบุลูกค้า'
    byClientMap.set(client, (byClientMap.get(client) ?? 0) + n)
    byClientCount.set(client, (byClientCount.get(client) ?? 0) + 1)
  }

  const byYear = Array.from(byYearMap.entries())
    .map(([year, value]) => {
      const prev = byYearMap.has(year - 1) ? byYearMap.get(year - 1)! : null
      const delta    = prev !== null ? value - prev : null
      const deltaPct = prev !== null && prev !== 0 ? (delta! / prev) * 100 : null
      return { year, value, count: byYearCount.get(year) ?? 0, delta, deltaPct }
    })
    .sort((a, b) => b.year - a.year)

  const byClient = Array.from(byClientMap.entries())
    .map(([client, value]) => ({ client, value, count: byClientCount.get(client) ?? 0 }))
    .sort((a, b) => b.value - a.value)

  return ok({ byYear, byClient, total, countWithValue, countTotal: (data ?? []).length })
}
