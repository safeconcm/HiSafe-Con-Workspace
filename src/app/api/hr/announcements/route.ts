// src/app/api/hr/announcements/route.ts
// GET  — list announcements targeting the current user's company (HR/Admin)
// POST — create a new announcement (HR/Admin). Plain JSON body: title, body,
//        category, company_ids, require_ack, and an OPTIONAL attachment
//        (attachment_url/attachment_type/attachment_name) already uploaded
//        straight to Supabase Storage by the client via
//        POST /api/hr/announcements/upload-url — this route no longer
//        accepts the raw file (see that route's comment for why: Vercel's
//        serverless function body-size cap was silently breaking uploads
//        near/over ~4.5MB, surfacing to the user as "Unexpected token 'R',
//        "Request En"... is not valid JSON" — found 2026-07-12). Dispatches
//        notifications (in_app/email/line) to every user in the targeted
//        company/companies — grouped per-company so each group's own
//        SMTP/LINE settings are used, not just the creator's company.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden, serverError,
  writeAuditLog, dispatchNotifications,
} from '@/lib/api-helpers'

const CATEGORIES = ['general', 'policy', 'event', 'emergency'] as const

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('id, company_ids, category, title, body, attachment_url, attachment_type, attachment_name, require_ack, created_by, created_at, users:created_by(first_name_th, last_name_th)')
    .contains('company_ids', [session.company_id])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return serverError(error)
  return ok({ announcements: data })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  const payload = await req.json().catch(() => null)
  if (!payload) return badRequest('ข้อมูลประกาศไม่ถูกต้อง')

  const title      = String(payload.title ?? '').trim()
  const body       = String(payload.body ?? '').trim()
  const category   = String(payload.category ?? '')
  const companyIds = Array.isArray(payload.company_ids) ? payload.company_ids : []
  const requireAck = payload.require_ack === true
  // Attachment is optional — a text-only announcement is perfectly valid
  // (user feedback 2026-07-12: "ไม่ควรบังคับให้แนบไฟล์ บางที่แค่ส่งข้อมูล
  // ก็ควรจะเผยแพร่ได้"). When present, it was already uploaded straight to
  // Supabase Storage by the client via /api/hr/announcements/upload-url.
  const attachmentUrl  = payload.attachment_url  ? String(payload.attachment_url)  : null
  const attachmentType = payload.attachment_type ? String(payload.attachment_type) : null
  const attachmentName = payload.attachment_name ? String(payload.attachment_name) : null

  if (!title) return badRequest('กรุณากรอกหัวข้อประกาศ')
  if (!body) return badRequest('กรุณากรอกเนื้อหาประกาศ')
  if (!CATEGORIES.includes(category as any)) return badRequest('หมวดหมู่ไม่ถูกต้อง')
  if (companyIds.length < 1 || companyIds.length > 2) return badRequest('กรุณาเลือกบริษัทเป้าหมาย 1-2 บริษัท')

  const supabase = createAdminSupabaseClient()

  // Confirm the targeted companies actually exist.
  const { data: companies, error: companiesErr } = await supabase
    .from('companies')
    .select('id')
    .in('id', companyIds)
  if (companiesErr) return serverError(companiesErr)
  if (!companies || companies.length !== companyIds.length) return badRequest('บริษัทเป้าหมายไม่ถูกต้อง')

  const { data: inserted, error: insertErr } = await supabase
    .from('announcements')
    .insert({
      company_ids: companyIds,
      category,
      title,
      body,
      attachment_url:  attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: attachmentName,
      require_ack: requireAck,
      created_by: session.id,
    })
    .select('id')
    .single()
  if (insertErr || !inserted) return serverError(insertErr ?? new Error('บันทึกประกาศไม่สำเร็จ'))

  await writeAuditLog({
    session, action: 'create', entity_type: 'announcement', entity_id: inserted.id,
    new_data: { title, category, company_ids: companyIds, require_ack: requireAck }, req,
  })

  // ── Dispatch notifications, grouped per-company so each group resolves
  //    its own company's SMTP/LINE settings (not just the creator's). ──
  try {
    for (const companyId of companyIds) {
      const { data: recipients } = await supabase
        .from('users')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'active')
      const recipientIds = (recipients ?? []).map((u) => u.id)
      if (recipientIds.length === 0) continue

      await dispatchNotifications({
        company_id: companyId,
        recipient_ids: recipientIds,
        event_type: 'announcement',
        title: `[ประกาศ] ${title}`,
        body,
        reference_id: inserted.id,
        reference_type: 'announcement',
      })
    }
  } catch (err) {
    // Notification failures must never fail the announcement creation itself.
    console.error('[announcements] dispatch error', err)
  }

  return created({ id: inserted.id, attachment_url: attachmentUrl })
}
