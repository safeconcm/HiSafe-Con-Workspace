// src/app/api/leave/[id]/medical-cert/route.ts
// POST /api/leave/:id/medical-cert
// Uploads the medical certificate file for a sick-leave request — separate
// from the main POST /api/leave create call (which stays plain JSON, see
// src/app/api/leave/route.ts) so the create flow is untouched. Mirrors the
// avatar-upload pattern in /api/profile: multipart/form-data, 2MB cap,
// image or PDF. 2026-07-14, per user request (item 1.4/2.4) — the file is
// appended as an extra page on the "พิมพ์แบบฟอร์มทางการ" PDF only (see
// /api/pdf/leave/[id]/official).
//
// Images over the 2MB cap are NOT rejected — they're compressed client-side
// before upload (see CreateLeaveForm.tsx), so this route's cap is really a
// backstop. PDFs can't be auto-compressed, so those ARE hard-capped at 2MB.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound, serverError,
} from '@/lib/api-helpers'

const MAX_FILE_BYTES = 2 * 1024 * 1024
// JPEG/PNG/PDF only (no WEBP) — the official-form PDF route embeds this
// file directly via pdf-lib, which can't embed WEBP images.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf']

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data: leave, error: fetchErr } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, status')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()
  if (fetchErr || !leave) return notFound('Leave request')
  // Only the requester themselves, on their own request, before it's been
  // fully decided — matches the same "still yours to edit" window as the
  // rest of the draft/pending leave-request fields.
  if (leave.user_id !== session.id) return forbidden()
  if (!['draft', 'pending'].includes(leave.status)) {
    return badRequest('ไม่สามารถแนบไฟล์ได้ เนื่องจากใบลานี้ถูกพิจารณาแล้ว')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('รูปแบบข้อมูลไม่ถูกต้อง')
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return badRequest('กรุณาแนบไฟล์')
  if (file.size > MAX_FILE_BYTES) return badRequest('ไฟล์ใหญ่เกิน 2MB')
  if (!ALLOWED_MIME.includes(file.type)) return badRequest('ไฟล์ต้องเป็น JPG, PNG หรือ PDF เท่านั้น')

  const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop() || 'jpg')
  const path = `leave-medical-cert/${params.id}.${ext}`
  const buf = await file.arrayBuffer()
  const { error: uploadErr } = await supabase.storage.from('documents').upload(path, buf, {
    contentType: file.type, upsert: true,
  })
  if (uploadErr) return serverError(new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${uploadErr.message}`))

  const { data: updated, error: updateErr } = await supabase
    .from('leave_requests')
    .update({ medical_cert_url: path, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, medical_cert_url')
    .single()
  if (updateErr) return serverError(updateErr)

  return ok(updated)
}
