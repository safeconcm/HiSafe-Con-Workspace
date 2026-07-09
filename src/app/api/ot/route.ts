// src/app/api/ot/route.ts
// GET  /api/ot  — list OT requests
// POST /api/ot  — create OT request

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, serverError,
  writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'
import { isWorkingDay } from '@/lib/work-schedule'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')
  const year    = searchParams.get('year')
  const page    = parseInt(searchParams.get('page') ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')
  const from    = (page - 1) * limit
  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('ot_requests')
    .select(`
      *,
      user:users!ot_requests_user_id_fkey(id, employee_code, first_name_th, last_name_th, department),
      approver:users!ot_requests_current_approver_id_fkey(id, first_name_th, last_name_th),
      job:jobs(id, job_code, name_th)
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (!isHROrAdmin(session)) {
    query = query.or(`user_id.eq.${session.id},current_approver_id.eq.${session.id}`)
  }
  if (status) query = query.eq('status', status)
  if (year)   query = query.gte('ot_date', `${year}-01-01`).lte('ot_date', `${year}-12-31`)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ requests: data ?? [], total: count ?? 0, page, per_page: limit })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { ot_date, start_time, end_time, job_id, reason } = body
  if (!ot_date || !start_time || !end_time) {
    return badRequest('ot_date, start_time, end_time required')
  }

  // Calculate hours
  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  const totalHours = parseFloat(((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2))
  if (totalHours <= 0)  return badRequest('end_time ต้องหลัง start_time')
  if (totalHours > 12)  return badRequest('OT สูงสุด 12 ชั่วโมงต่อวัน')

  const supabase = createAdminSupabaseClient()

  // Determine OT type from date — uses this company's actual work schedule
  // (weekly pattern + date overrides) instead of assuming Sat/Sun are
  // always the weekend, so e.g. Highcon's working Saturdays correctly
  // classify as 'weekday' OT, not 'weekend' OT.
  const d = new Date(ot_date)
  const workingDay = await isWorkingDay(supabase, session.company_id, d)
  let ot_type: 'weekday' | 'weekend' | 'holiday' = workingDay ? 'weekday' : 'weekend'

  const { data: holiday } = await supabase
    .from('holidays').select('id')
    .eq('company_id', session.company_id).eq('holiday_date', ot_date).single()
  if (holiday) ot_type = 'holiday'

  // Find approver
  const { data: approverId } = await supabase.rpc('find_approver', {
    p_user_id: session.id, p_start_date: ot_date, p_end_date: ot_date,
  })

  const { data: ot, error } = await supabase
    .from('ot_requests')
    .insert({
      company_id:          session.company_id,
      user_id:             session.id,
      ot_date,
      ot_type,
      start_time,
      end_time,
      total_hours:         totalHours,
      job_id:              job_id ?? null,
      reason:              reason ?? null,
      status:              'pending',
      current_approver_id: approverId ?? null,
    })
    .select().single()

  if (error) return serverError(error)

  // Auto-approve if CEO
  if (!approverId) {
    await supabase.from('ot_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', ot.id)
    await supabase.from('ot_approvals').insert({
      ot_request_id: ot.id, approver_name: 'ระบบ (Auto)',
      action: 'auto_approved', sequence: 99,
    })
  } else {
    await dispatchNotifications({
      company_id: session.company_id, recipient_ids: [approverId],
      event_type: 'general',
      title: 'มีคำขอ OT รออนุมัติ',
      body:  `${session.first_name_th} ${session.last_name_th} ขอทำ OT ${totalHours} ชม. วันที่ ${ot_date}`,
      reference_id: ot.id, reference_type: 'leave_request',
    })
  }

  await writeAuditLog({
    session, action: 'ot.submitted', entity_type: 'ot_request', entity_id: ot.id, new_data: ot, req,
  })
  return created(ot)
}
