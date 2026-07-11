// src/app/api/inquiries/[id]/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  const supabase = createAdminSupabaseClient()

  const { data: inquiry, error } = await supabase.from('hr_inquiries')
    .select(`
      *,
      user:users!hr_inquiries_user_id_fkey(id, employee_code, first_name_th, last_name_th, department, avatar_url),
      closed_by_user:users!hr_inquiries_closed_by_fkey(first_name_th, last_name_th)
    `)
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (error || !inquiry) return notFound('Inquiry')
  if (!isHROrAdmin(session) && inquiry.user_id !== session.id) return forbidden()

  const { data: messages, error: msgErr } = await supabase.from('hr_inquiry_messages')
    .select(`
      *,
      sender:users!hr_inquiry_messages_sender_id_fkey(id, first_name_th, last_name_th, role, avatar_url)
    `)
    .eq('inquiry_id', params.id)
    .order('created_at', { ascending: true })
  if (msgErr) return serverError(msgErr)

  return ok({ ...inquiry, messages: messages ?? [] })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase.from('hr_inquiries').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Inquiry')

  const isOwner = existing.user_id === session.id
  if (!isHROrAdmin(session) && !isOwner) return forbidden()

  const body   = await req.json().catch(() => ({}))
  const action = body.action // 'close' | 'reopen'
  const now    = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (action === 'close') {
    // Both the owner (marking their own question resolved) and HR/Admin
    // may close a ticket.
    updates.status    = 'closed'
    updates.closed_at = now
    updates.closed_by = session.id
  } else if (action === 'reopen') {
    // Reopening is HR/Admin-only — an employee who wants to revisit a
    // closed ticket does so by posting a new reply, which auto-reopens
    // it (see /api/inquiries/[id]/messages).
    if (!isHROrAdmin(session)) return forbidden()
    updates.status    = 'open'
    updates.closed_at = null
    updates.closed_by = null
  } else {
    return badRequest('action ต้องเป็น close หรือ reopen')
  }

  const { data, error } = await supabase.from('hr_inquiries')
    .update(updates).eq('id', params.id).select().single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: `inquiry.${action}`, entity_type: 'hr_inquiry',
    entity_id: params.id, old_data: existing, new_data: data, req,
  })
  return ok(data)
}
