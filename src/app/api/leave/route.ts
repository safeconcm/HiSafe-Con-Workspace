// src/app/api/leave/route.ts
// GET  /api/leave  — list leave requests (scoped by role)
// POST /api/leave  — create new leave request

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, serverError,
  writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'
import { LEAVE_TYPE_LABEL, formatDateRangeSlashTH } from '@/utils'
import type { LeaveType } from '@/types/database'

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const page      = Math.max(1, parseInt(searchParams.get('page')      ?? '1'))
  const limit     = Math.min(100, parseInt(searchParams.get('limit')   ?? '20'))
  const status    = searchParams.get('status')
  const leaveType = searchParams.get('leave_type')
  const year      = searchParams.get('year')
  const userId    = searchParams.get('user_id')  // HR/Admin: filter by specific user
  // "My leave" pages (as opposed to "approvals" pages) want literally only
  // requests this user filed themselves — without this, a supervisor's own
  // "ใบลาของฉัน" list was polluted with their reports' pending requests,
  // because the OR-clause below (needed for the approvals page) doesn't
  // distinguish "show my dashboard" from "show only what I personally filed".
  const ownOnly   = searchParams.get('own_only') === '1'
  // "Team calendar" (leave/team page) wants every APPROVED leave for the
  // caller's direct reports, regardless of who currently holds
  // current_approver_id — which is exactly the field the old supervisor
  // OR-clause below relies on, and it gets set back to null the moment a
  // leave is approved (see /api/leave/[id]/approve). So for approved leaves
  // that OR-clause always collapses to "just my own", which is why
  // subordinates' approved leave never showed up on a supervisor's team
  // calendar. Resolve the team via organization_nodes instead — the same
  // parent/child tree already used by the team payroll view (/api/payroll).
  const teamOnly  = searchParams.get('team_only') === '1'
  const from      = (page - 1) * limit

  const supabase  = createAdminSupabaseClient()

  // HR/Admin already see the whole company on this endpoint with no filter
  // at all (existing behavior below) — team_only should only change
  // anything for supervisors, who otherwise have no way to see their
  // reports' approved leave. Restricting HR/Admin to an org_nodes lookup
  // here would regress them (most HR/Admin accounts have no org_node
  // children), so this is scoped to role === 'supervisor' only.
  const isTeamScopedSupervisor = teamOnly && session.role === 'supervisor'
  let teamUserIds: string[] = []
  if (isTeamScopedSupervisor) {
    const { data: myNode } = await supabase
      .from('organization_nodes').select('id')
      .eq('user_id', session.id).eq('is_active', true).maybeSingle()
    const { data: reports } = myNode
      ? await supabase.from('organization_nodes').select('user_id')
          .eq('parent_id', myNode.id).eq('is_active', true)
      : { data: [] }
    teamUserIds = (reports ?? []).map((r: any) => r.user_id)
  }

  let query = supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, avatar_url, department
      ),
      approver:users!leave_requests_current_approver_id_fkey(
        id, first_name_th, last_name_th
      )
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  // Scope by role
  if (ownOnly) {
    query = query.eq('user_id', session.id)
  } else if (isTeamScopedSupervisor) {
    query = teamUserIds.length
      ? query.in('user_id', teamUserIds)
      : query.eq('id', '00000000-0000-0000-0000-000000000000') // no reports → guaranteed-empty result
  } else if (!isHROrAdmin(session)) {
    if (session.role === 'supervisor') {
      // Supervisors see: their own leave, items currently pending on them
      // (current_approver_id), AND items they've already decided on
      // (approved_by_id) — that last one matters for the "อนุมัติแล้ว"
      // history tab on /approvals/leave: current_approver_id gets nulled
      // out the moment a request is approved (see /api/leave/[id]/approve),
      // so without approved_by_id here, asking for status=approved always
      // came back empty for a supervisor even though they were the one who
      // approved it.
      if (!userId || userId === session.id) {
        query = query.or(`user_id.eq.${session.id},current_approver_id.eq.${session.id},approved_by_id.eq.${session.id}`)
      } else {
        query = query.eq('user_id', userId)
      }
    } else {
      // Employee: own only
      query = query.eq('user_id', session.id)
    }
  } else if (userId) {
    query = query.eq('user_id', userId)
  }

  // Filters
  if (status)    query = query.eq('status', status)
  if (leaveType) query = query.eq('leave_type', leaveType)
  if (year)      query = query.gte('start_date', `${year}-01-01`).lte('end_date', `${year}-12-31`)

  const { data, count, error } = await query
  if (error) return serverError(error)

  return ok({ requests: data, total: count ?? 0, page, per_page: limit })
}

// ── POST ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  let body: any
  try { body = await req.json() } catch { return badRequest('Invalid JSON') }

  const { leave_type, start_date, end_date, is_half_day, half_day_period, reason, attachment_url } = body

  if (!leave_type || !start_date || !end_date) {
    return badRequest('leave_type, start_date, end_date are required')
  }
  if (new Date(end_date) < new Date(start_date)) {
    return badRequest('end_date must be >= start_date')
  }
  if (is_half_day && start_date !== end_date) {
    return badRequest('Half-day leave must be single day')
  }
  if (is_half_day && !half_day_period) {
    return badRequest('half_day_period required for half-day leave')
  }

  const supabase = createAdminSupabaseClient()
  const year = new Date(start_date).getFullYear()

  // 0. Probation check — no annual leave entitlement yet; sick/personal
  // stay normal but are marked unpaid (deducted at daily rate in payroll,
  // since there's no paid-leave bank during probation). Additive check
  // only — doesn't touch the existing flow for non-probation employees.
  const { data: activeContract } = await supabase
    .from('contracts')
    .select('id, probation_status')
    .eq('user_id', session.id)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const onProbation = activeContract?.probation_status === 'pending'
  if (onProbation && leave_type === 'annual') {
    return badRequest('อยู่ระหว่างทดลองงาน ยังไม่มีสิทธิ์ลาพักร้อน')
  }
  const isUnpaid = onProbation && ['sick', 'personal'].includes(leave_type)

  // 1. Calculate working days
  const { data: totalDays, error: calcErr } = await supabase
    .rpc('calc_leave_days', {
      p_company_id:  session.company_id,
      p_start_date:  start_date,
      p_end_date:    end_date,
      p_is_half_day: is_half_day ?? false,
    })
  if (calcErr) return serverError(calcErr)
  if (!totalDays || totalDays === 0) {
    return badRequest('วันที่เลือกเป็นวันหยุดทั้งหมด ไม่สามารถยื่นลาได้')
  }

  // 2. Check leave balance (skip for maternity/other)
  if (!['maternity', 'other'].includes(leave_type)) {
    const { data: balance, error: balErr } = await supabase
      .rpc('get_leave_balance', {
        p_user_id:    session.id,
        p_leave_type: leave_type,
        p_year:       year,
      })
    if (balErr) return serverError(balErr)
    if ((balance ?? 0) < totalDays) {
      return badRequest(`วันลาไม่เพียงพอ คงเหลือ ${balance ?? 0} วัน (ต้องการ ${totalDays} วัน)`)
    }
  }

  // 3. Find approver
  const { data: approverId, error: approverErr } = await supabase
    .rpc('find_approver', {
      p_user_id:    session.id,
      p_start_date: start_date,
      p_end_date:   end_date,
    })
  if (approverErr) return serverError(approverErr)

  // 3b. Self-service e-signature — if this employee has already saved a
  // signature (Profile > ลายเซ็นดิจิทัลของฉัน), auto-attach it right now as
  // their signature on this request. No separate "please sign" step later:
  // submitting the request IS signing it, as the requester. If they haven't
  // saved a signature yet, this just stays null — the leave still submits
  // fine, the signature block on the PDF/detail page just shows blank.
  const { data: signer } = await supabase
    .from('users').select('signature_url').eq('id', session.id).single()

  // 4. Insert leave request
  const { data: leaveReq, error: insertErr } = await supabase
    .from('leave_requests')
    .insert({
      company_id:          session.company_id,
      user_id:             session.id,
      leave_type,
      status:              'pending',
      start_date,
      end_date,
      is_half_day:         is_half_day ?? false,
      half_day_period:     half_day_period ?? null,
      total_days:          totalDays,
      reason:              reason ?? null,
      attachment_url:      attachment_url ?? null,
      current_approver_id: approverId ?? null,   // NULL = CEO → auto-approve
      is_unpaid:           isUnpaid,
      signature_employee_url: signer?.signature_url ?? null,
      signature_employee_at:  signer?.signature_url ? new Date().toISOString() : null,
    })
    .select()
    .single()
  if (insertErr) return serverError(insertErr)

  // 5. Reserve pending days in balance (atomic via DB function)
  const { error: pendingErr } = await supabase.rpc('increment_pending_days', {
    p_user_id:    session.id,
    p_leave_type: leave_type,
    p_year:       year,
    p_days:       totalDays,
  })
  if (pendingErr) {
    // Fallback: direct update
    const { data: balRow } = await supabase.from('leave_balances')
      .select('pending_days')
      .eq('user_id', session.id)
      .eq('leave_type', leave_type)
      .eq('year', year)
      .single()
    if (balRow) {
      await supabase.from('leave_balances')
        .update({ pending_days: Math.max(((balRow as any).pending_days ?? 0) + totalDays, 0) })
        .eq('user_id', session.id)
        .eq('leave_type', leave_type)
        .eq('year', year)
    }
  }

  // 6. Handle CEO auto-approve (no approver)
  if (!approverId) {
    await supabase.from('leave_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', leaveReq.id)

    await supabase.from('leave_approvals').insert({
      leave_request_id: leaveReq.id,
      approver_id:      null,
      approver_name:    'ระบบ (Auto)',
      action:           'auto_approved',
      comment:          'ไม่มีผู้อนุมัติเหนือกว่า — อนุมัติอัตโนมัติ',
      sequence:         99,
    })

    // Update balance: pending → used
    await supabase.from('leave_balances')
      .select('pending_days, used_days')
      .eq('user_id', session.id).eq('leave_type', leave_type).eq('year', year).single()
      .then(({ data: bal }: { data: { pending_days: number; used_days: number } | null }) => {
        if (bal) supabase.from('leave_balances').update({
          pending_days: Math.max((bal.pending_days ?? 0) - totalDays, 0),
          used_days:    (bal.used_days ?? 0) + totalDays,
        }).eq('user_id', session.id).eq('leave_type', leave_type).eq('year', year)
      })

    await supabase.rpc('lock_timesheet_for_leave', { p_leave_request_id: leaveReq.id })

    // Notify HR
    const { data: hrUsers } = await supabase.from('users')
      .select('id').eq('company_id', session.company_id).in('role', ['hr', 'admin'])
    const hrIds = (hrUsers ?? []).map((u: any) => u.id)
    if (hrIds.length) {
      await dispatchNotifications({
        company_id: session.company_id,
        recipient_ids: hrIds,
        event_type: 'leave_approved',
        title: 'ใบลาอนุมัติอัตโนมัติ (CEO)',
        body: `${session.first_name_th} ${session.last_name_th} ยื่นลา ${totalDays} วัน (อนุมัติอัตโนมัติ)`,
        reference_id: leaveReq.id,
        reference_type: 'leave_request',
      })
    }
  } else {
    // 7. Notify approver — the existing "needs your action" notification.
    // Body now includes the leave type + a compact date range (previously
    // just "ยื่นลา N วัน" with no type/dates) — see cardText fix below.
    const leaveTypeLabel = LEAVE_TYPE_LABEL[leave_type as LeaveType] ?? leave_type
    const dateRangeSlash = formatDateRangeSlashTH(start_date, end_date)

    await dispatchNotifications({
      company_id:     session.company_id,
      recipient_ids:  [approverId],
      event_type:     'leave_submitted',
      title:          'มีใบลารออนุมัติ',
      body:           `${session.first_name_th} ${session.last_name_th} - ${leaveTypeLabel} ${totalDays} วัน (${dateRangeSlash})`,
      reference_id:   leaveReq.id,
      reference_type: 'leave_request',
    })

    // 7b. Also notify the submitter themselves with a "pending approval"
    // confirmation — separate call (same event_type, so it stays inside the
    // existing LINE_NOTIFY_EVENTS allowlist) so the approver's message copy
    // above is untouched. Body follows the exact 3-part layout requested
    // 2026-07-12: title (card's own "ใบลาใหม่ (รออนุมัติ)"), then leave
    // type + days + date range, then a short "sent" confirmation on its own
    // line. The confirmation line was shortened from the literal requested
    // wording ("ใบลาคุณถูกส่งแล้ว สถานะ: รออนุมัติ") to "ส่งแล้ว รออนุมัติ" —
    // the full wording combined with the line above doesn't fit the LINE
    // card's ~59-char text budget (65 chars, would silently truncate the
    // tail again) and the title already says "(รออนุมัติ)".
    await dispatchNotifications({
      company_id:     session.company_id,
      recipient_ids:  [session.id],
      event_type:     'leave_submitted',
      title:          'ส่งใบลาสำเร็จ รออนุมัติ',
      body:           `${leaveTypeLabel} ${totalDays} วัน (${dateRangeSlash})\nส่งแล้ว รออนุมัติ`,
      reference_id:   leaveReq.id,
      reference_type: 'leave_request',
    })
  }

  // 8. Audit log
  await writeAuditLog({
    session,
    action:      'leave.submitted',
    entity_type: 'leave_request',
    entity_id:   leaveReq.id,
    new_data:    leaveReq,
    req,
  })

  return created(leaveReq)
}
