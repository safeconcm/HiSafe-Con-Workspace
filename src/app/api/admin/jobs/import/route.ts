// src/app/api/admin/jobs/import/route.ts
// POST /api/admin/jobs/import — bulk-create Job Codes from a parsed CSV/
// Excel file (2026-10-20, "ข้อ 5": creating jobs one at a time was the only
// option before this — mirrors the existing employee bulk-import pattern,
// see /api/admin/users/import/route.ts and src/app/access/users/import/page.tsx.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, writeAuditLog,
} from '@/lib/api-helpers'

const REQUIRED_COLS = ['job_code', 'name_th']
const MAX_ROWS = 500

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                 return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  const rows: Record<string, string>[] = body?.rows
  const year: number = body?.year ?? new Date().getFullYear()
  if (!Array.isArray(rows) || !rows.length) return badRequest('ไม่มีข้อมูลให้นำเข้า')
  if (rows.length > MAX_ROWS) return badRequest(`นำเข้าได้สูงสุด ${MAX_ROWS} รายการต่อครั้ง`)

  // Validate every row BEFORE inserting anything — same "all or nothing up
  // front" UX as the employee importer: a bad file should never leave the
  // caller unsure which rows made it in.
  const errors: { row: number; error: string }[] = []
  const seenCodes = new Set<string>()
  rows.forEach((r, i) => {
    const rowNum = i + 2 // header is row 1
    const missing = REQUIRED_COLS.filter(c => !r[c]?.trim())
    if (missing.length) {
      errors.push({ row: rowNum, error: `ขาดข้อมูล: ${missing.join(', ')}` })
      return
    }
    const code = r.job_code.trim().toUpperCase()
    if (seenCodes.has(code)) {
      errors.push({ row: rowNum, error: `Job Code "${code}" ซ้ำกันในไฟล์เดียวกัน` })
      return
    }
    // มูลค่างาน (2026-10-21): optional column — blank means "not entered",
    // same rule as the single-create/edit APIs. A non-blank value that isn't
    // a non-negative number fails this row up front, same "all or nothing"
    // validation pass as everything else here.
    const rawValue = r.contract_value?.trim()
    if (rawValue) {
      const n = Number(rawValue.replace(/,/g, ''))
      if (!Number.isFinite(n) || n < 0) {
        errors.push({ row: rowNum, error: `มูลค่างาน "${rawValue}" ต้องเป็นตัวเลขที่ไม่ติดลบ` })
        return
      }
    }
    seenCodes.add(code)
  })

  if (errors.length) {
    return ok({ success: false, created: 0, failed: rows.length, total: rows.length, errors }, 200)
  }

  const supabase = createAdminSupabaseClient()

  // Check against jobs that already exist in the DB for this company+year
  // (uq_jobs_company_code_year) — caught up front so a duplicate reads as a
  // normal per-row failure instead of a generic Postgres error message.
  const { data: existing } = await supabase
    .from('jobs')
    .select('job_code')
    .eq('company_id', session.company_id)
    .eq('year', year)
    .in('job_code', Array.from(seenCodes))
  const existingCodes = new Set((existing ?? []).map(j => j.job_code))

  const results: { row: number; job_code: string; success: boolean; error?: string }[] = []
  let created = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    const code = r.job_code.trim().toUpperCase()

    if (existingCodes.has(code)) {
      results.push({ row: rowNum, job_code: code, success: false, error: `Job Code "${code}" มีในระบบแล้วสำหรับปี ${year}` })
      continue
    }

    const rawValue = r.contract_value?.trim()
    const contractValue = rawValue ? Number(rawValue.replace(/,/g, '')) : null

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        company_id:     session.company_id,
        job_code:       code,
        name_th:        r.name_th.trim(),
        name_en:        r.name_en?.trim()     || null,
        year,
        status:         'active',
        description:    r.description?.trim() || null,
        client_name:    r.client_name?.trim() || null,
        contract_value: contractValue,
        created_by:     session.id,
      })
      .select('id')
      .single()

    if (error) {
      results.push({ row: rowNum, job_code: code, success: false, error: error.message.includes('unique') ? `Job Code "${code}" ซ้ำ` : error.message })
      continue
    }

    existingCodes.add(code) // guard against a duplicate row later in the same file
    created++
    results.push({ row: rowNum, job_code: code, success: true })

    await writeAuditLog({
      session, action: 'job.created', entity_type: 'job',
      entity_id: data.id, new_data: { ...r, job_code: code }, req,
    })
  }

  return ok({
    success: created > 0,
    created,
    failed: rows.length - created,
    total: rows.length,
    results,
  })
}
