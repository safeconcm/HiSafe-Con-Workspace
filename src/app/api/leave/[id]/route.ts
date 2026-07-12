// src/app/api/leave/[id]/route.ts
// GET   /api/leave/:id  — get single leave request with approvals
// PATCH /api/leave/:id  — edit (draft only)
// DELETE /api/leave/:id — cancel request

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  notFound, serverError, writeAuditLog,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, avatar_url, position_th, department
      ),
      approver:users!leave_requests_current_approver_id_fkey(
        id, first_name_th, last_name_th
      ),
      approved_by:users!leave_requests_approved_by_id_fkey(
        id, first_name_th, last_name_th
      ),
      approvals:leave_approvals(
        id, action, comment, sequence, acted_at,
        approver:users!leave_approvals_approver_id_fkey(id, first_name_th, last_name_th)
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !data) return notFound('Leave request')

  // Employees can only see own
  if (session.role === 'employee' && data.user_id !== session.id) return forbidden()

  // Self-service e-signature: the DB only stores the storage PATH (private
  // "documents" bucket), which the browser can't fetch directly — turn each
  // into a short-lived signed URL here so the on-screen signature display
  // (see LeaveSignatureSection) can just use a plain <img src>. Same private-
  // bucket reasoning as the PDF route, just signed URLs instead of inlined
  // data: URIs since a normal browser tab (unlike Puppeteer) can follow one.
  async function signedUrl(path: string | null): Promise<string | null> {
    if (!path) return null
    const { data: signed } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
    return signed?.signedUrl ?? null
  }
  const [signatureEmployeeSignedUrl, signatureApproverSignedUrl] = await Promise.all([
    signedUrl(data.signature_employee_url ?? null),
    signedUrl(data.signature_approver_url ?? null),
  ])

  return ok({
    ...data,
    signature_employee_signed_url: signatureEmployeeSignedUrl,
    signature_approver_signed_url: signatureApproverSignedUrl,
  })
}

// ── PATCH ─────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  // Fetch existing
  const { data: existing, error: fetchErr } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (fetchErr || !existing) return notFound('Leave request')
  if (existing.user_id !== session.id) return forbidden()
  if (existing.status !== 'draft') return badRequest('สามารถแก้ไขได้เฉพาะใบลาที่เป็น Draft')

  let body: any
  try { body = await req.json() } catch { return badRequest('Invalid JSON') }

  const { leave_type, start_date, end_date, is_half_day, half_day_period, reason } = body
  const updates: any = {}
  if (leave_type)     updates.leave_type     = leave_type
  if (start_date)     updates.start_date     = start_date
  if (end_date)       updates.end_date       = end_date
  if (is_half_day !== undefined) updates.is_half_day = is_half_day
  if (half_day_period) updates.half_day_period = half_day_period
  if (reason !== undefined) updates.reason   = reason

  // Recalculate total_days if dates changed
  const newStart = start_date ?? existing.start_date
  const newEnd   = end_date   ?? existing.end_date
  const newHalf  = is_half_day !== undefined ? is_half_day : existing.is_half_day

  const { data: totalDays } = await supabase.rpc('calc_leave_days', {
    p_company_id:  session.company_id,
    p_start_date:  newStart,
    p_end_date:    newEnd,
    p_is_half_day: newHalf,
  })
  updates.total_days = totalDays

  const { data: updated, error: updateErr } = await supabase
    .from('leave_requests')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (updateErr) return serverError(updateErr)

  await writeAuditLog({
    session, action: 'leave.edited', entity_type: 'leave_request',
    entity_id: params.id, old_data: existing, new_data: updated, req,
  })

  return ok(updated)
}

// ── DELETE (cancel) ───────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (!existing) return notFound('Leave request')
  if (existing.user_id !== session.id) return forbidden()

  const body = await req.json().catch(() => ({}))
  const cancel_reason = body.cancel_reason ?? null

  if (existing.status === 'draft' || existing.status === 'pending') {
    // Direct cancel
    await supabase.from('leave_requests').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason,
    }).eq('id', params.id)

    // Release pending days (atomic)
    if (existing.status === 'pending') {
      const year = new Date(existing.start_date).getFullYear()
      const { error: decErr } = await supabase.rpc('decrement_pending_days', {
        p_user_id:    session.id,
        p_leave_type: existing.leave_type,
        p_year:       year,
        p_days:       existing.total_days,
      })
      if (decErr) {
        // Fallback: direct update (mirrors the increment fallback in
        // POST /api/leave) — without this, an RPC failure here silently
        // leaves pending_days stuck forever, since the leave request itself
        // still gets marked 'cancelled' either way. This is exactly what
        // happened before decrement_pending_days existed in the DB (bug
        // fixed 2026-07-12): the request cancelled fine but the reserved
        // days were never released back to the employee's balance.
        const { data: balRow } = await supabase.from('leave_balances')
          .select('pending_days')
          .eq('user_id', session.id)
          .eq('leave_type', existing.leave_type)
          .eq('year', year)
          .single()
        if (balRow) {
          await supabase.from('leave_balances')
            .update({ pending_days: Math.max(((balRow as any).pending_days ?? 0) - existing.total_days, 0) })
            .eq('user_id', session.id)
            .eq('leave_type', existing.leave_type)
            .eq('year', year)
        }
      }
    }
  } else if (existing.status === 'approved') {
    // Need re-approval for cancellation
    await supabase.from('leave_requests').update({
      status: 'cancel_pending', cancel_reason,
    }).eq('id', params.id)
  } else {
    return badRequest('ไม่สามารถยกเลิกใบลาในสถานะนี้ได้')
  }

  await writeAuditLog({
    session, action: 'leave.cancelled', entity_type: 'leave_request',
    entity_id: params.id, old_data: existing, req,
  })

  return ok({ id: params.id, status: 'cancelled' })
}
