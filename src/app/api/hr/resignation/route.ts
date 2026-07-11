// src/app/api/hr/resignation/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'
import { defaultClearanceItems } from '@/lib/onboarding-items'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')
  const page    = parseInt(searchParams.get('page')  ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')
  const from    = (page - 1) * limit
  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('resignations')
    .select(`
      *,
      user:users!resignations_user_id_fkey(
        id, employee_code, first_name_th, last_name_th,
        department, position_th, hire_date
      ),
      acknowledged_by_user:users!resignations_acknowledged_by_fkey(first_name_th, last_name_th),
      approved_by_user:users!resignations_approved_by_fkey(first_name_th, last_name_th)
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (!isHROrAdmin(session)) query = query.eq('user_id', session.id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ resignations: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { resign_date, last_work_date, reason } = body
  if (!resign_date || !last_work_date) {
    return badRequest('resign_date, last_work_date required')
  }
  if (new Date(last_work_date) < new Date(resign_date)) {
    return badRequest('last_work_date ต้องอยู่หลังหรือเท่ากับ resign_date')
  }

  const supabase = createAdminSupabaseClient()

  // Check no active resignation
  const { data: existing } = await supabase.from('resignations').select('id')
    .eq('user_id', session.id).in('status', ['pending','acknowledged'])
    .single()
  if (existing) return badRequest('มีคำขอลาออกที่รอดำเนินการอยู่แล้ว')

  const { data, error } = await supabase.from('resignations').insert({
    company_id:        session.company_id,
    user_id:           session.id,
    status:            'pending',
    resign_date,
    last_work_date,
    reason:            reason ?? null,
    reason_category:   body.reason_category ?? null,
    // Seed the standard clearance checklist so HR has something to work
    // through immediately (equipment return, access revocation, etc.) —
    // this jsonb column already existed but was never populated with
    // anything by default, so it always rendered as an empty, unusable list.
    clearance_items:   body.clearance_items ?? defaultClearanceItems(),
  }).select().single()

  if (error) return serverError(error)

  // Notify HR
  const { data: hrUsers } = await supabase.from('users').select('id')
    .eq('company_id', session.company_id).eq('role', 'hr').eq('status', 'active')
  if (hrUsers?.length) {
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: hrUsers.map((u: any) => u.id),
      event_type:    'general',
      title:         'มีคำขอลาออกใหม่',
      body:          `${session.first_name_th} ${session.last_name_th} ขอลาออก วันสุดท้าย ${last_work_date}`,
      reference_id:  data.id,
      reference_type:'leave_request',
    })
  }

  await writeAuditLog({
    session, action: 'resignation.submitted', entity_type: 'resignation',
    entity_id: data.id, new_data: data, req,
  })
  return created(data)
}
