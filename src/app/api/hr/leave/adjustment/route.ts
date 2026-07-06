// src/app/api/hr/leave/adjustment/route.ts
// POST /api/hr/leave/adjustment — HR manually adjusts leave balance

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, dispatchNotifications,
  isHROrAdmin,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { user_id, leave_type, year, adjusted_days, reason } = body
  if (!user_id || !leave_type || !year || adjusted_days === undefined || !reason) {
    return badRequest('user_id, leave_type, year, adjusted_days, reason are required')
  }

  const supabase = createAdminSupabaseClient()

  // Verify user belongs to same company
  const { data: targetUser } = await supabase
    .from('users').select('id, first_name_th, last_name_th, company_id')
    .eq('id', user_id).eq('company_id', session.company_id).single()
  if (!targetUser) return badRequest('User not found in your company')

  // Fetch current balance
  const { data: bal } = await supabase
    .from('leave_balances').select('*')
    .eq('user_id', user_id).eq('leave_type', leave_type).eq('year', year).single()

  if (!bal) return badRequest('ไม่พบยอดวันลาสำหรับปีนี้ กรุณาตรวจสอบ')

  const old_data = { ...bal }
  const new_adjusted = (bal.adjusted_days ?? 0) + Number(adjusted_days)

  const { error } = await supabase.from('leave_balances')
    .update({ adjusted_days: new_adjusted, updated_at: new Date().toISOString() })
    .eq('user_id', user_id).eq('leave_type', leave_type).eq('year', year)

  if (error) return serverError(error)

  // Notify employee
  await dispatchNotifications({
    company_id:    session.company_id,
    recipient_ids: [user_id],
    event_type:    'leave_balance_adjusted',
    title:         'วันลาของคุณได้รับการปรับแก้',
    body:          `วันลา${leave_type === 'annual' ? 'พักร้อน' : leave_type} ปี ${year} ถูกปรับ ${adjusted_days > 0 ? '+' : ''}${adjusted_days} วัน โดย HR`,
    reference_type: 'leave_balance',
  })

  await writeAuditLog({
    session, action: 'leave_balance.adjusted', entity_type: 'leave_balance',
    entity_id: bal.id, old_data,
    new_data: { ...old_data, adjusted_days: new_adjusted, reason }, req,
  })

  return ok({ user_id, leave_type, year, adjusted_days: new_adjusted })
}
