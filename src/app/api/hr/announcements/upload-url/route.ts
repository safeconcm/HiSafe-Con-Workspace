// src/app/api/hr/announcements/upload-url/route.ts
// POST — issue a Supabase Storage signed upload URL for an announcement
// attachment. This is a tiny JSON request/response (filename + content type
// in, a signed URL out) — the actual file bytes never pass through this
// Vercel serverless function.
//
// Why this exists: the old flow sent the file itself as multipart/form-data
// straight to POST /api/hr/announcements. Vercel's Node.js serverless
// functions hard-cap the request body around 4.5MB (Hobby/Pro plans, not
// configurable via next.config for App Router route handlers) — so a 5MB
// image upload would get rejected by the platform with a plain-text 413
// "Request Entity Too Large" response before our route code ever ran. The
// frontend then tried to `res.json()` that plain-text body and crashed with
// "Unexpected token 'R', "Request En"... is not valid JSON" (found while
// debugging user report 2026-07-12). Issuing a signed upload URL here and
// having the browser PUT the file directly to Supabase Storage sidesteps
// the platform limit entirely, and also lets us support larger, non-image
// attachments (PDF/Word/Excel) per the same request.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, serverError,
} from '@/lib/api-helpers'

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const MAX_FILE_BYTES = 15 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const filename    = String(body.filename ?? '').trim()
  const contentType = String(body.content_type ?? '').trim()
  const size         = Number(body.size ?? 0)

  if (!filename)    return badRequest('กรุณาระบุชื่อไฟล์')
  if (!ALLOWED_MIME.includes(contentType)) {
    return badRequest('ไฟล์ต้องเป็น JPG, PNG, WEBP, GIF, PDF, Word หรือ Excel เท่านั้น')
  }
  if (size > MAX_FILE_BYTES) return badRequest('ไฟล์ใหญ่เกิน 15MB')

  const supabase = createAdminSupabaseClient()
  const ext  = filename.split('.').pop() || 'bin'
  const path = `${crypto.randomUUID()}.${ext}`

  const { data, error } = await supabase.storage
    .from('announcements')
    .createSignedUploadUrl(path)
  if (error || !data) return serverError(error ?? new Error('สร้างลิงก์อัปโหลดไม่สำเร็จ'))

  const { data: pub } = supabase.storage.from('announcements').getPublicUrl(path)

  return ok({
    signed_url:  data.signedUrl,
    token:       data.token,
    path:        data.path,
    public_url:  pub.publicUrl,
  })
}
