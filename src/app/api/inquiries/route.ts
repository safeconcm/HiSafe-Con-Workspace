// src/app/api/inquiries/route.ts
// GET  /api/inquiries — list. HR/Admin see the whole company inbox;
//      everyone else sees only their own inquiries (own_only is implicit
//      for non-HR, mirroring the pattern in /api/leave and /api/ot).
// POST /api/inquiries — submit a new question to HR (creates the
//      inquiry header + its first message in one call).
//
// This is deliberately an async "submit a question, get a reply" system
// (subject + threaded messages, status open/answered/closed) — not a
// live chat. See hr_inquiries / hr_inquiry_messages tables.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, serverError,
  writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'

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
    .from('hr_inquiries')
    .select(`
      *,
      user:users!hr_inquiries_user_id_fkey(id, employee_code, first_name_th, last_name_th, department, avatar_url),
      closed_by_user:users!hr_inquiries_closed_by_fkey(first_name_th, last_name_th)
    `, { count: 'exact' })
    .eq('company_id', session.company_id)
    .order('last_message_at', { ascending: false })
    .range(from, from + limit - 1)

  if (!isHROrAdmin(session)) query = query.eq('user_id', session.id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return serverError(error)
  return ok({ inquiries: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { subject, message } = body
  if (!subject?.trim() || !message?.trim()) {
    return badRequest('subject และ message ต้องไม่เว้นว่าง')
  }

  const category = ['general', 'leave', 'payroll', 'contract', 'benefits', 'other']
    .includes(body.category) ? body.category : 'general'

  const supabase = createAdminSupabaseClient()

  const { data: inquiry, error } = await supabase
    .from('hr_inquiries')
    .insert({
      company_id: session.company_id,
      user_id:    session.id,
      category,
      subject:    subject.trim(),
      status:     'open',
    })
    .select().single()
  if (error) return serverError(error)

  const { error: msgError } = await supabase
    .from('hr_inquiry_messages')
    .insert({ inquiry_id: inquiry.id, sender_id: session.id, body: message.trim() })
  if (msgError) return serverError(msgError)

  // Notify HR/Admin so a new question doesn't sit unnoticed
  const { data: hrUsers } = await supabase.from('users').select('id')
    .eq('company_id', session.company_id).in('role', ['hr', 'admin']).eq('status', 'active')
  if (hrUsers?.length) {
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: hrUsers.map((u: any) => u.id),
      event_type:    'inquiry_submitted',
      title:         'มีคำถามใหม่จากพนักงาน',
      body:          `${session.first_name_th} ${session.last_name_th}: ${subject.trim()}`,
      reference_id:  inquiry.id,
      reference_type: 'inquiry',
    })
  }

  await writeAuditLog({
    session, action: 'inquiry.submitted', entity_type: 'hr_inquiry',
    entity_id: inquiry.id, new_data: inquiry, req,
  })
  return created(inquiry)
}
