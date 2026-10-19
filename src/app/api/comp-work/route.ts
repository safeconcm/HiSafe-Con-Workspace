// src/app/api/comp-work/route.ts
// GET  /api/comp-work  — list compensatory-work requests
// POST /api/comp-work  — create a new one (employee works a holiday/weekend
//                        to offset a leave day already taken — see
//                        src/lib/comp-work.ts for the full design note)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, serverError,
  writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'
import { isWorkingDay } from '@/lib/work-schedule'
import { applyCompWorkApproval } from '@/lib/comp-work'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')
  const year    = searchParams.get('year')
  const page    = parseInt(searchParams.get('page') ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')
  const ownOnly = searchParams.get('own_only') === '1'
  const from    = (page - 1) * limit
  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('comp_work_requests')
    .select(`
      *,
      user:users!comp_work_requests_user_id_fkey(id, employee_code, first_name_th, last_name_th, department),
      approver:users!comp_work_requests_current_approver_id_fkey(id, first_name_th, last_name_th),
      job:jobs(id, job_code, name_th)
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (ownOnly) {
    query = query.eq('user_id', session.id)
  } else if (!isHROrAdmin(session)) {
    query = query.or(`user_id.eq.${session.id},current_approver_id.eq.${session.id}`)
  }
  if (status) query = query.eq('status', status)
  if (year)   query = query.gte('work_date', `${year}-01-01`).lte('work_date', `${year}-12-31`)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ requests: data ?? [], total: count ?? 0, page, per_page: limit })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { work_date, job_id, hours, offset_leave_type, reason } = body
  if (!work_date || !job_id) return badRequest('work_date, job_id required')

  const hrs = hours ? Number(hours) : 8
  if (!(hrs > 0 && hrs <= 8)) return badRequest('hours ต้องอยู่ระหว่าง 0-8')

  const leaveType = offset_leave_type || 'study'

  const supabase = createAdminSupabaseClient()

  // Must be a day off (weekend/company holiday) — this feature is
  // specifically "ทำงานชดเชยวันอาทิตย์/วันหยุดบริษัท", not a normal workday.
  const d = new Date(work_date)
  const workingDay = await isWorkingDay(supabase, session.company_id, d)
  const { data: holiday } = await supabase
    .from('holidays').select('id')
    .eq('company_id', session.company_id).eq('holiday_date', work_date).eq('is_active', true)
    .maybeSingle()
  if (workingDay && !holiday) {
    return badRequest('วันที่เลือกเป็นวันทำงานปกติ ไม่ใช่วันหยุด — ใช้ชดเชยได้เฉพาะวันหยุดสุดสัปดาห์หรือวันหยุดบริษัทเท่านั้น')
  }

  // Must have enough already-used days on the offset leave type to offset —
  // can't offset leave that hasn't been taken.
  const year = Number(work_date.slice(0, 4))
  const { data: balance } = await supabase
    .from('leave_balances')
    .select('used_days')
    .eq('user_id', session.id)
    .eq('leave_type', leaveType)
    .eq('year', year)
    .maybeSingle()
  const daysOffset = hrs / 8
  if ((balance?.used_days ?? 0) < daysOffset) {
    return badRequest(`ไม่มีวันลาที่ใช้ไปแล้วให้ชดเชย (ใช้ไปแล้ว ${balance?.used_days ?? 0} วัน ต้องการชดเชย ${daysOffset} วัน)`)
  }

  // Find approver (same org-tree walk leave/OT use)
  const { data: approverId } = await supabase.rpc('find_approver', {
    p_user_id: session.id, p_start_date: work_date, p_end_date: work_date,
  })

  const { data: cw, error } = await supabase
    .from('comp_work_requests')
    .insert({
      company_id:          session.company_id,
      user_id:             session.id,
      work_date,
      job_id,
      hours:               hrs,
      offset_leave_type:   leaveType,
      reason:              reason ?? null,
      status:              'pending',
      current_approver_id: approverId ?? null,
    })
    .select().single()
  if (error) return serverError(error)

  if (!approverId) {
    // Auto-approve if CEO — same convention as OT.
    await supabase.from('comp_work_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', cw.id)
    await supabase.from('comp_work_approvals').insert({
      comp_work_request_id: cw.id, approver_name: 'ระบบ (Auto)',
      action: 'auto_approved', sequence: 99,
    })
    await applyCompWorkApproval(supabase, { ...cw, offset_leave_type: leaveType })
  } else {
    await dispatchNotifications({
      company_id: session.company_id, recipient_ids: [approverId],
      event_type: 'comp_work_submitted',
      title: 'มีคำขอทำงานชดเชยรออนุมัติ',
      body:  `${session.first_name_th} ${session.last_name_th} ขอทำงานชดเชยวันที่ ${work_date} (${hrs} ชม.)`,
      reference_id: cw.id, reference_type: 'comp_work_request',
    })
  }

  await writeAuditLog({
    session, action: 'comp_work.submitted', entity_type: 'comp_work_request', entity_id: cw.id, new_data: cw, req,
  })
  return created(cw)
}
