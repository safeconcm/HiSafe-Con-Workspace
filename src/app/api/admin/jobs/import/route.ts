// src/app/api/admin/jobs/import/route.ts
// POST /api/admin/jobs/import — bulk-create Job Codes from a parsed CSV/
// Excel file (2026-10-20, "ข้อ 5": creating jobs one at a time was the only
// option before this — mirrors the existing employee bulk-import pattern,
// see /api/admin/users/import/route.ts and src/app/access/users/import/page.tsx.
//
// 2026-10-21 ("ถ้าเราแอด Job ซ้ำจากไฟล์เดิม จะเป็นไรไหม ... จะอัพเดทเฉพาะ
// ข้อมูลที่ขาด"): re-importing a file that includes Job Codes already in the
// system is no longer a hard failure. For a job_code+year that already
// exists, this now UPDATES it — but only the columns that are currently
// NULL on the existing row (name_en, client_name, description,
// contract_value, start_date, end_date, sequence_no). Anything already
// filled in is left exactly as-is, so re-running the same file (or a newer
// export that happens to also include older rows) is always safe: it only
// ever backfills gaps, never overwrites or reverts a value someone already
// set through the UI. job_code/name_th/year identify the row and are never
// touched by this backfill path.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, writeAuditLog,
} from '@/lib/api-helpers'
import { parseOptionalDate, parseOptionalInt } from '../route'

const REQUIRED_COLS = ['job_code', 'name_th']
const MAX_ROWS = 500

// Columns a duplicate-row import is allowed to backfill when the existing
// value is NULL. job_code/name_th/year/status are intentionally excluded —
// identity fields never change via this path, and status is a deliberate
// user action elsewhere (see STATUS_WARNING in the Jobs page).
const FILLABLE_COLS = ['name_en', 'client_name', 'description', 'contract_value', 'start_date', 'end_date', 'sequence_no'] as const

function parseContractValue(raw: string | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = raw?.trim()
  if (!s) return { ok: true, value: null }
  const n = Number(s.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `มูลค่างาน "${s}" ต้องเป็นตัวเลขที่ไม่ติดลบ` }
  return { ok: true, value: n }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                 return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  const rows: Record<string, string>[] = body?.rows
  const year: number = body?.year ?? new Date().getFullYear()
  if (!Array.isArray(rows) || !rows.length) return badRequest('ไม่มีข้อมูลให้นำเข้า')
  if (rows.length > MAX_ROWS) return badRequest(`นำเข้าได้สูงสุด ${MAX_ROWS} รายการต่อครั้ง`)

  // Validate every row BEFORE writing anything — same "all or nothing up
  // front" UX as the employee importer: a bad file should never leave the
  // caller unsure which rows made it in. (Duplicate job_code *within the
  // file itself* is still a hard error here — that's always a mistake in
  // the file, unlike a duplicate against what's already in the DB.)
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

    // มูลค่างาน + วันที่เริ่ม/สิ้นสุด + ลำดับ Job (2026-10-21): all optional,
    // blank means "not entered" — a non-blank value that fails validation
    // fails this row outright, same as the single-create/edit APIs.
    const cv = parseContractValue(r.contract_value)
    if (!cv.ok) { errors.push({ row: rowNum, error: cv.error }); return }
    const sd = parseOptionalDate(r.start_date)
    if (!sd.ok) { errors.push({ row: rowNum, error: sd.error }); return }
    const ed = parseOptionalDate(r.end_date)
    if (!ed.ok) { errors.push({ row: rowNum, error: ed.error }); return }
    if (sd.value && ed.value && sd.value > ed.value) {
      errors.push({ row: rowNum, error: 'วันที่เริ่มต้องไม่อยู่หลังวันที่สิ้นสุด' }); return
    }
    const seq = parseOptionalInt(r.sequence_no)
    if (!seq.ok) { errors.push({ row: rowNum, error: seq.error }); return }

    seenCodes.add(code)
  })

  if (errors.length) {
    return ok({ success: false, created: 0, updated: 0, skipped: 0, failed: rows.length, total: rows.length, errors }, 200)
  }

  const supabase = createAdminSupabaseClient()

  // Fetch the FULL existing rows (not just job_code) so a duplicate can be
  // backfilled field-by-field instead of just being flagged as a conflict.
  const { data: existingRows } = await supabase
    .from('jobs')
    .select('*')
    .eq('company_id', session.company_id)
    .eq('year', year)
    .in('job_code', Array.from(seenCodes))
  const existingByCode = new Map((existingRows ?? []).map(j => [j.job_code, j]))

  const results: { row: number; job_code: string; success: boolean; action?: 'created' | 'updated' | 'skipped'; error?: string }[] = []
  let created = 0, updated = 0, skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2
    const code = r.job_code.trim().toUpperCase()

    const cv  = parseContractValue(r.contract_value)
    const sd  = parseOptionalDate(r.start_date)
    const ed  = parseOptionalDate(r.end_date)
    const seq = parseOptionalInt(r.sequence_no)
    const incoming: Record<string, unknown> = {
      name_en:        r.name_en?.trim()     || null,
      client_name:    r.client_name?.trim() || null,
      description:    r.description?.trim() || null,
      contract_value: cv.ok  ? cv.value  : null,
      start_date:     sd.ok  ? sd.value  : null,
      end_date:       ed.ok  ? ed.value  : null,
      sequence_no:    seq.ok ? seq.value : null,
    }

    const existingJob = existingByCode.get(code)

    if (existingJob) {
      // Duplicate — backfill only the columns currently NULL on the
      // existing row, and only where the file actually has a value.
      const patch: Record<string, unknown> = {}
      for (const col of FILLABLE_COLS) {
        if (existingJob[col] === null && incoming[col] !== null) patch[col] = incoming[col]
      }

      if (!Object.keys(patch).length) {
        skipped++
        results.push({ row: rowNum, job_code: code, success: true, action: 'skipped' })
        continue
      }

      patch.updated_at = new Date().toISOString()
      const { data: updatedJob, error } = await supabase
        .from('jobs').update(patch).eq('id', existingJob.id).select().single()

      if (error) {
        results.push({ row: rowNum, job_code: code, success: false, error: error.message })
        continue
      }

      updated++
      results.push({ row: rowNum, job_code: code, success: true, action: 'updated' })
      existingByCode.set(code, updatedJob) // guard against the same code repeating later in the file
      await writeAuditLog({
        session, action: 'job.updated', entity_type: 'job',
        entity_id: existingJob.id, old_data: existingJob, new_data: updatedJob, req,
      })
      continue
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        company_id: session.company_id,
        job_code:   code,
        name_th:    r.name_th.trim(),
        year,
        status:     'active',
        created_by: session.id,
        ...incoming,
      })
      .select()
      .single()

    if (error) {
      results.push({ row: rowNum, job_code: code, success: false, error: error.message.includes('unique') ? `Job Code "${code}" ซ้ำ` : error.message })
      continue
    }

    existingByCode.set(code, data) // guard against a duplicate row later in the same file
    created++
    results.push({ row: rowNum, job_code: code, success: true, action: 'created' })

    await writeAuditLog({
      session, action: 'job.created', entity_type: 'job',
      entity_id: data.id, new_data: data, req,
    })
  }

  return ok({
    success: created + updated > 0,
    created,
    updated,
    skipped,
    failed: rows.length - created - updated - skipped,
    total: rows.length,
    results,
  })
}
