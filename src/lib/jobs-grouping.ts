// src/lib/jobs-grouping.ts
// Shared Job-list grouping/sorting logic (2026-10-21, pulled out of
// src/app/access/jobs/page.tsx so the PDF export route — src/app/api/pdf/
// jobs/route.ts — can produce EXACTLY the same grouping, order, and labels
// as what's on screen, instead of drifting out of sync with a second
// hand-written copy of the same rules).

export type JobGroupBy = 'year' | 'client'

// Group Jobs by their "J-code" year prefix (2026-10-20, "Jxx 2 ตัวหน้าซ้ำกัน
// จะได้ดูง่าย") — e.g. J24034/J24035/J24036 all cluster under one "J24"
// sub-header. The J-code can live in either job_code (SAFECON tenant, e.g.
// "J260001") or name_th (HIGHCON tenant, which uses a plain running number
// as job_code and keeps the real J-code in name_th, e.g. job_code "15" /
// name_th "J24034" — confirmed live via SQL on 2026-10-20). Jobs with no
// recognizable J-code fall into a catch-all "อื่นๆ" group shown last.
export function jobGroupCode(job: any): string | null {
  const m = /^J(\d{2})/i.exec(job.job_code ?? '') || /^J(\d{2})/i.exec(job.name_th ?? '')
  return m ? `J${m[1]}` : null
}

// Second grouping dimension (2026-10-20, "กลุ่มลูกค้าไหมดีไหม ลูกค้าเจ้านี้
// งานอะไรบ้าง เป็นประวัติไว้") — "-" shows up as a literal placeholder value
// from some CSV imports, so it's treated the same as a blank client_name.
export function clientGroupLabel(job: any): string {
  const c = (job.client_name ?? '').trim()
  return c && c !== '-' ? c : 'ไม่ระบุลูกค้า'
}

export function groupFallbackLabel(groupBy: JobGroupBy): string {
  return groupBy === 'year' ? 'อื่นๆ' : 'ไม่ระบุลูกค้า'
}

// ลำดับ Job (2026-10-21, "เพิ่ม...ลำดับ Job ด้วย"; 2026-10-22, "ลำดับ Job
// code ควรจะเรียงอันดับมาก หรือล่าสุดขึ้นบนก่อน" — flipped to descending) —
// within a group, a Job with a HIGHER sequence_no sorts first (the newest/
// most-recently-numbered Job shows at the top); a Job with a sequence_no
// still sorts ahead of one without, regardless of direction. Ties (or both
// null) fall back to job_code, also descending, so the unassigned tail of a
// group still reads newest-looking-code-first.
function compareJobs(a: any, b: any): number {
  const sa = a.sequence_no, sb = b.sequence_no
  if (sa != null && sb != null && sa !== sb) return sb - sa
  if (sa != null && sb == null) return -1
  if (sa == null && sb != null) return 1
  return String(b.job_code ?? '').localeCompare(String(a.job_code ?? ''))
}

export interface JobGroup { key: string; jobs: any[] }

// Groups + sorts `jobs` exactly as the Jobs page renders them: grouped by
// the chosen dimension, groups ordered newest-year-first (or alphabetical
// client name), the catch-all/unassigned group always last, and each
// group's rows sorted by compareJobs above.
export function groupJobs(jobs: any[], groupBy: JobGroupBy): JobGroup[] {
  const map = new Map<string, any[]>()
  for (const job of jobs) {
    const key = groupBy === 'year' ? (jobGroupCode(job) ?? 'อื่นๆ') : clientGroupLabel(job)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(job)
  }
  for (const arr of map.values()) arr.sort(compareJobs)

  const fallback = groupFallbackLabel(groupBy)
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === fallback) return 1
    if (b === fallback) return -1
    return groupBy === 'year' ? b.localeCompare(a) : a.localeCompare(b, 'th')
  })

  return keys.map(key => ({ key, jobs: map.get(key)! }))
}
