// src/app/api/hr/announcements/route.ts
// GET  — list announcements targeting the current user's company (HR/Admin)
// POST — create a new announcement (HR/Admin). Accepts multipart/form-data:
//        a "data" field (JSON: title, body, category, company_ids) plus a
//        required "image" file. Uploads the image to the public
//        "announcements" bucket, inserts the row, then dispatches
//        notifications (in_app/email/line) to every user in the targeted
//        company/companies — grouped per-company so each group's own
//        SMTP/LINE settings are used, not just the creator's company.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden, serverError,
  writeAuditLog, dispatchNotifications,
} from '@/lib/api-helpers'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const CATEGORIES = ['general', 'policy', 'event', 'emergency'] as const

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('id, company_ids, category, title, body, image_url, require_ack, created_by, created_at, users:created_by(first_name_th, last_name_th)')
    .contains('company_ids', [session.company_id])
    .order('created_at', { ascending: false })
  if (error) return serverError(error)
  return ok({ announcements: data })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('รูปแบบข้อมูลไม่ถูกต้อง')
  }

  const rawData = form.get('data')
  if (typeof rawData !== 'string') return badRequest('ไม่พบข้อมูลประกาศ')

  let payload: { title?: string; body?: string; category?: string; company_ids?: string[]; require_ack?: boolean }
  try {
    payload = JSON.parse(rawData)
  } catch {
    return badRequest('ข้อมูลประกาศไม่ถูกต้อง')
  }

  const title = String(payload.title ?? '').trim()
  const body = String(payload.body ?? '').trim()
  const category = String(payload.category ?? '')
  const companyIds = Array.isArray(payload.company_ids) ? payload.company_ids : []
  const requireAck = payload.require_ack === true

  if (!title) return badRequest('กรุณากรอกหัวข้อประกาศ')
  if (!body) return badRequest('กรุณากรอกเนื้อหาประกาศ')
  if (!CATEGORIES.includes(category as any)) return badRequest('หมวดหมู่ไม่ถูกต้อง')
  if (companyIds.length < 1 || companyIds.length > 2) return badRequest('กรุณาเลือกบริษัทเป้าหมาย 1-2 บริษัท')

  const image = form.get('image')
  if (!(image instanceof File) || image.size === 0) return badRequest('กรุณาแนบรูปภาพประกอบประกาศ')
  if (image.size > MAX_FILE_BYTES) return badRequest('ไฟล์รูปภาพใหญ่เกิน 5MB')
  if (!ALLOWED_MIME.includes(image.type)) return badRequest('ไฟล์ต้องเป็น JPG, PNG, WEBP หรือ GIF เท่านั้น')

  const supabase = createAdminSupabaseClient()

  // Confirm the targeted companies actually exist.
  const { data: companies, error: companiesErr } = await supabase
    .from('companies')
    .select('id')
    .in('id', companyIds)
  if (companiesErr) return serverError(companiesErr)
  if (!companies || companies.length !== companyIds.length) return badRequest('บริษัทเป้าหมายไม่ถูกต้อง')

  // ── Upload image to the public "announcements" bucket ──
  const ext = image.name.split('.').pop() || 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const buf = await image.arrayBuffer()
  const { error: uploadErr } = await supabase.storage.from('announcements').upload(path, buf, {
    contentType: image.type, upsert: false,
  })
  if (uploadErr) return serverError(new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${uploadErr.message}`))
  const { data: pub } = supabase.storage.from('announcements').getPublicUrl(path)
  const image_url = pub.publicUrl

  const { data: inserted, error: insertErr } = await supabase
    .from('announcements')
    .insert({
      company_ids: companyIds,
      category,
      title,
      body,
      image_url,
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
        .eq('is_active', true)
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

  return created({ id: inserted.id, image_url })
}
