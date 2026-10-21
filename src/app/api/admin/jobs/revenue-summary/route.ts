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
//
// 2026-10-22 bugfix ("มูลค่างานแยกตามปี มีแต่ปี 2026 ทั้งที่ ปี 2024 2025 ก็มี
// ยอด ไม่แยก"): this first cut grouped by the jobs.year DB column — but that
// column is just whatever year the Jobs page's dropdown happened to be on
// when the row was created (src/app/access/jobs/page.tsx's handleSave posts
// `{...form, year}` using the page's current `year` state), so practically
// every Job in the system ends up stamped with the same recent year even
// when it's a record of a much older project. The Jobs list's own "ปี"
// grouping (src/lib/jobs-grouping.ts groupJobs) never uses that column for
// this reason — it derives the real project year from the "Jxx" prefix on
// job_code or name_th (e.g. job_code "J24034" or name_th "J25002"). Reusing
// that exact same jobGroupCode() here is what makes this page's "ปี" match
// what the Jobs list already shows as J24/J25/J26 groups, instead of
// re-deriving a second, inevitably-divergent notion of "year".
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, createAdminSupabaseClient, ok, unauthorized, serverError } from '@/lib/api-helpers'
import { jobGroupCode, clientGroupLabel } from '@/lib/jobs-grouping'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('job_code, name_th, contract_value, client_name')
    .eq('company_id', session.company_id)

  if (error) return serverError(error)

  // Keyed by the real project year (parsed from the Jxx code), not the raw
  // DB `year` column. `null` means no recognizable Jxx prefix — those still
  // count toward the grand total, but can't be placed on a year axis, so
  // they're reported separately as `unassignedValue`/`unassignedCount`
  // rather than silently bucketed into some arbitrary year.
  const byYearMap   = new Map<number, number>()
  const byYearCount = new Map<number, number>()
  const byClientMap   = new Map<string, number>()
  const byClientCount = new Map<string, number>()
  let total = 0
  let countWithValue = 0
  let unassignedValue = 0
  let unassignedCount = 0

  for (const row of data ?? []) {
    const v = row.contract_value
    if (v === null || v === undefined) continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    countWithValue++
    total += n

    const code = jobGroupCode(row) // e.g. "J24" -> project year 2024
    const year = code ? 2000 + Number(code.slice(1)) : null
    if (year !== null) {
      byYearMap.set(year, (byYearMap.get(year) ?? 0) + n)
      byYearCount.set(year, (byYearCount.get(year) ?? 0) + 1)
    } else {
      unassignedValue += n
      unassignedCount++
    }

    const client = clientGroupLabel(row)
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

  return ok({
    byYear, byClient, total, countWithValue, countTotal: (data ?? []).length,
    unassignedValue, unassignedCount,
  })
}
