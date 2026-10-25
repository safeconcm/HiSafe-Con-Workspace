// src/app/api/admin/jobs/[id]/route.ts
// PATCH  /api/admin/jobs/:id — edit job / toggle status
// DELETE /api/admin/jobs/:id — real delete, but ONLY when the Job has zero
// references anywhere (timesheet_lines, ot_requests, comp_work_requests —
// see those 3 tables' job_id FKs). This is for the "กรอก Job ผิด ไม่มีปุ่ม
// ลบ" complaint (2026-10-20): a typo'd Job created by mistake, never used
// for anything, should actually disappear — not just sit around closed
// forever occupying that job_code for the year. A Job that HAS been used
// for real work must never be hard-deleted (would silently blow a hole in
// historical Timesheet/Job Cost/OT/comp-work records) — those get the
// existing "ปิด" (closed) status path instead, via the status dropdown.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog, getAccessibleCompanyIds,
} from '@/lib/api-helpers'
import { parseOptionalDate, parseOptionalInt } from '../route'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  // 2026-10-26, cross-company read grant (Issue 2)
  const accessibleCompanyIds = await getAccessibleCompanyIds(session)
  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('jobs').select('*')
    .eq('id', params.id).in('company_id', accessibleCompanyIds).single()
  if (!existing) return notFound('Job')

  const body = await req.json().catch(() => ({}))
  const allowed = [
    'job_code', 'name_th', 'name_en', 'status', 'description', 'client_name',
    'contract_value', 'contract_no', 'start_date', 'end_date', 'sequence_no',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // มูลค่างาน: same validation as POST (src/app/api/admin/jobs/route.ts) —
  // empty string clears it back to NULL, a negative/non-numeric value is
  // rejected rather than silently stored.
  if ('contract_value' in updates) {
    const raw = updates.contract_value
    if (raw === '' || raw === null || raw === undefined) {
      updates.contract_value = null
    } else {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) return badRequest('มูลค่างานต้องเป็นตัวเลขที่ไม่ติดลบ')
      updates.contract_value = n
    }
  }

  // วันที่เริ่ม/สิ้นสุด + ลำดับ Job (2026-10-21) — same optional, blank-clears
  // rule as contract_value above; shared parsers live in the sibling
  // route.ts (POST uses them too).
  if ('start_date' in updates) {
    const parsed = parseOptionalDate(updates.start_date)
    if (!parsed.ok) return badRequest(parsed.error)
    updates.start_date = parsed.value
  }
  if ('end_date' in updates) {
    const parsed = parseOptionalDate(updates.end_date)
    if (!parsed.ok) return badRequest(parsed.error)
    updates.end_date = parsed.value
  }
  const effectiveStart = ('start_date' in updates ? updates.start_date : existing.start_date) as string | null
  const effectiveEnd   = ('end_date'   in updates ? updates.end_date   : existing.end_date)   as string | null
  if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
    return badRequest('วันที่เริ่มต้องไม่อยู่หลังวันที่สิ้นสุด')
  }
  if ('sequence_no' in updates) {
    const parsed = parseOptionalInt(updates.sequence_no)
    if (!parsed.ok) return badRequest(parsed.error)
    updates.sequence_no = parsed.value
  }

  const { data: updated, error } = await supabase
    .from('jobs').update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'job.updated', entity_type: 'job',
    entity_id: params.id, old_data: existing, new_data: updated, req,
  })

  return ok(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const accessibleCompanyIds = await getAccessibleCompanyIds(session)
  const supabase = createAdminSupabaseClient()

  const { data: existing } = await supabase
    .from('jobs').select('*')
    .eq('id', params.id).in('company_id', accessibleCompanyIds).maybeSingle()
  if (!existing) return notFound('Job')

  // Checked up front (clearer message than waiting for the FK error below),
  // but the FK constraints on all 3 tables are the real backstop — this is
  // just so a used Job gets a specific, friendly reason instead of a raw
  // Postgres error.
  const [{ count: tsCount }, { count: otCount }, { count: cwCount }] = await Promise.all([
    supabase.from('timesheet_lines').select('id', { count: 'exact', head: true }).eq('job_id', params.id),
    supabase.from('ot_requests').select('id', { count: 'exact', head: true }).eq('job_id', params.id),
    supabase.from('comp_work_requests').select('id', { count: 'exact', head: true }).eq('job_id', params.id),
  ])
  if ((tsCount ?? 0) > 0 || (otCount ?? 0) > 0 || (cwCount ?? 0) > 0) {
    return badRequest('ไม่สามารถลบได้ Job นี้มีข้อมูล Timesheet/OT/งานชดเชยผูกอยู่แล้ว กรุณาเปลี่ยนสถานะเป็น "ปิด" แทน เพื่อรักษาประวัติไว้')
  }

  const { error } = await supabase
    .from('jobs').delete()
    .eq('id', params.id).in('company_id', accessibleCompanyIds)

  if (error) {
    // Belt-and-suspenders: a FK violation slipping past the counts above
    // (race condition) still gets a friendly message instead of a raw 500.
    if (error.code === '23503') {
      return badRequest('ไม่สามารถลบได้ Job นี้มีข้อมูลผูกอยู่แล้ว กรุณาเปลี่ยนสถานะเป็น "ปิด" แทน เพื่อรักษาประวัติไว้')
    }
    return serverError(error)
  }

  await writeAuditLog({
    session, action: 'job.deleted', entity_type: 'job', entity_id: params.id, old_data: existing, req,
  })

  return ok({ id: params.id, deleted: true })
}
