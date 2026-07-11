// src/app/api/inquiries/[id]/messages/route.ts
// POST — add a reply to an inquiry thread.
// HR/Admin replying marks the ticket 'answered'; the owner replying to an
// already-answered or closed ticket reopens it — either way this is a
// two-way async thread, not a live chat.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, dispatchNotifications, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body?.message?.trim()) return badRequest('message ต้องไม่เว้นว่าง')

  const supabase = createAdminSupabaseClient()
  const { data: inquiry } = await supabase.from('hr_inquiries').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!inquiry) return notFound('Inquiry')

  const isOwner = inquiry.user_id === session.id
  const isStaff = isHROrAdmin(session)
  if (!isOwner && !isStaff) return forbidden()

  const now = new Date().toISOString()
  const { data: msg, error } = await supabase.from('hr_inquiry_messages')
    .insert({ inquiry_id: params.id, sender_id: session.id, body: body.message.trim() })
    .select(`*, sender:users!hr_inquiry_messages_sender_id_fkey(id, first_name_th, last_name_th, role, avatar_url)`)
    .single()
  if (error) return serverError(error)

  const newStatus = isStaff ? 'answered' : 'open'
  await supabase.from('hr_inquiries')
    .update({ status: newStatus, last_message_at: now, updated_at: now })
    .eq('id', params.id)

  // Notify whichever side didn't just send this message
  if (isStaff) {
    await dispatchNotifications({
      company_id:    session.company_id,
      recipient_ids: [inquiry.user_id],
      event_type:    'inquiry_reply',
      title:         'HR ตอบคำถามของคุณแล้ว',
      body:          `${session.first_name_th} ${session.last_name_th}: ${body.message.trim().slice(0, 100)}`,
      reference_id:  inquiry.id,
      reference_type: 'inquiry',
    })
  } else {
    const { data: hrUsers } = await supabase.from('users').select('id')
      .eq('company_id', session.company_id).in('role', ['hr', 'admin']).eq('status', 'active')
    if (hrUsers?.length) {
      await dispatchNotifications({
        company_id:    session.company_id,
        recipient_ids: hrUsers.map((u: any) => u.id),
        event_type:    'inquiry_reply',
        title:         'พนักงานตอบกลับคำถาม',
        body:          `${session.first_name_th} ${session.last_name_th}: ${body.message.trim().slice(0, 100)}`,
        reference_id:  inquiry.id,
        reference_type: 'inquiry',
      })
    }
  }

  await writeAuditLog({
    session, action: 'inquiry.replied', entity_type: 'hr_inquiry',
    entity_id: params.id, new_data: msg, req,
  })
  return ok(msg)
}
