// src/app/api/admin/jobs/route.ts
// GET  /api/admin/jobs  — list jobs (all roles can read active)
// POST /api/admin/jobs  — create job (admin only)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, escapeForOrFilter,
} from '@/lib/api-helpers'

// วันที่เริ่ม/สิ้นสุด + ลำดับ Job (2026-10-21) — all optional. A date column
// stores 'YYYY-MM-DD' or null; an empty string from the form means "not
// entered", same convention as contract_value below. Shared by POST here and
// PATCH in [id]/route.ts (small enough not to warrant a shared lib export).
//
// 2026-10-22 bugfix ("Excel ใส่แบบนี้ 2025-02-07 ... ระบบแจ้ง รูปแบบวันที่ไม่
// ถูกต้อง 2025-2-7"): the <input type="date"> form always sends a strict,
// zero-padded 'YYYY-MM-DD', but a CSV/Excel cell typed as plain text (not a
// real date cell) comes through as whatever the user typed, e.g. the
// single-digit "2025-2-7" the old regex rejected outright even though it's
// an unambiguous, valid date. Now accepts year-first Y-M-D/Y/M/D with 1-2
// digit month/day (any padding), AND day-first D-M-Y/D/M/Y — per the user,
// a plain D/M/Y (not month-first, US-style) is the normal convention for a
// non-ISO date in these files — always referencing the Gregorian (ค.ศ.) year,
// never Buddhist era. Both forms normalize to zero-padded 'YYYY-MM-DD' and
// are validated as a real calendar date (rejects e.g. month 13 or Feb 30).
export function parseOptionalDate(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const s = String(raw).trim()

  let y: number, mo: number, d: number
  let m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(s)       // Y-M-D / Y/M/D
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
  } else {
    m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(s)         // D-M-Y / D/M/Y
    if (!m) return { ok: false, error: `รูปแบบวันที่ไม่ถูกต้อง: "${s}" (ต้องเป็น YYYY-MM-DD หรือ D/M/YYYY อ้างอิง ค.ศ.)` }
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3])
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    return { ok: false, error: `วันที่ไม่ถูกต้อง: "${s}"` }
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = `${y}-${pad(mo)}-${pad(d)}`
  const parsed = new Date(iso + 'T00:00:00Z')
  // Reject dates that don't round-trip (e.g. 2026-02-30 -> rolls to March).
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() + 1 !== mo || parsed.getUTCDate() !== d) {
    return { ok: false, error: `วันที่ไม่ถูกต้อง: "${s}"` }
  }
  return { ok: true, value: iso }
}

export function parseOptionalInt(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isInteger(n)) return { ok: false, error: `ลำดับ Job "${raw}" ต้องเป็นเลขจำนวนเต็ม` }
  return { ok: true, value: n }
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year')   ?? String(new Date().getFullYear()))
  const status = searchParams.get('status') ?? 'active'
  const search = searchParams.get('q')

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('jobs')
    .select('id, job_code, name_th, name_en, year, status, client_name, description, contract_value, contract_no, start_date, end_date, sequence_no, created_at', { count: 'exact' })
    .eq('company_id', session.company_id)
    .eq('year', year)
    .order('job_code')

  if (status !== 'all') query = query.eq('status', status)
  if (search) {
    const s = escapeForOrFilter(search)
    query = query.or(`job_code.ilike.%${s}%,name_th.ilike.%${s}%`)
  }

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ jobs: data ?? [], total: count ?? 0, year })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body?.job_code || !body?.name_th) return badRequest('job_code and name_th required')

  // มูลค่างาน (2026-10-21, "Job Codes ต้องมีให้เพิ่มมูลค่างานด้วย"): optional,
  // nullable — empty string/undefined means "not entered", not zero. Rejects
  // a negative or non-numeric value outright rather than silently storing
  // garbage, since this number feeds the revenue summary totals.
  let contractValue: number | null = null
  if (body.contract_value !== undefined && body.contract_value !== null && body.contract_value !== '') {
    const n = Number(body.contract_value)
    if (!Number.isFinite(n) || n < 0) return badRequest('มูลค่างานต้องเป็นตัวเลขที่ไม่ติดลบ')
    contractValue = n
  }

  // วันที่เริ่ม/สิ้นสุด + ลำดับ Job (2026-10-21, "เพิ่ม start date, end date
  // และ ลำดับ Job ด้วย") — all optional, same "blank = not entered" rule.
  const startDate = parseOptionalDate(body.start_date)
  if (!startDate.ok) return badRequest(startDate.error)
  const endDate = parseOptionalDate(body.end_date)
  if (!endDate.ok) return badRequest(endDate.error)
  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    return badRequest('วันที่เริ่มต้องไม่อยู่หลังวันที่สิ้นสุด')
  }
  const sequenceNo = parseOptionalInt(body.sequence_no)
  if (!sequenceNo.ok) return badRequest(sequenceNo.error)

  const supabase = createAdminSupabaseClient()
  const year = body.year ?? new Date().getFullYear()

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      company_id:     session.company_id,
      job_code:       body.job_code.trim().toUpperCase(),
      name_th:        body.name_th.trim(),
      name_en:        body.name_en?.trim()     ?? null,
      year,
      status:         body.status              ?? 'active',
      description:    body.description?.trim() ?? null,
      client_name:    body.client_name?.trim() ?? null,
      contract_no:    body.contract_no?.trim()  ?? null,
      contract_value: contractValue,
      start_date:     startDate.value,
      end_date:       endDate.value,
      sequence_no:    sequenceNo.value,
      created_by:     session.id,
    })
    .select()
    .single()

  if (error) {
    if (error.message.includes('unique')) return badRequest(`Job code "${body.job_code}" มีในระบบแล้วสำหรับปี ${year}`)
    return serverError(error)
  }

  await writeAuditLog({
    session, action: 'job.created', entity_type: 'job',
    entity_id: data.id, new_data: data, req,
  })

  return created(data)
}
