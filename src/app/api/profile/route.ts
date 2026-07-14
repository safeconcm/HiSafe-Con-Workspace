// src/app/api/profile/route.ts
// Self-service profile for the logged-in user (any role).
// GET   — own record
// PATCH — multipart/form-data: optional "phone" text field + optional
//         "avatar" image file (uploaded to the public "avatars" bucket).
// Deliberately does NOT allow editing name / position / department / role /
// email here — those affect payroll, permissions, and login, so they stay
// Admin-only (see /api/admin/users/[id]).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, serverError,
} from '@/lib/api-helpers'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, employee_code, email, first_name_th, last_name_th, first_name_en, last_name_en, position_th, department, role, hire_date, phone, address, avatar_url, line_user_id')
    .eq('id', session.id)
    .single()
  if (error) return serverError(error)

  // Employees can see their own contracts and certificates (read-only) —
  // deliberately NOT salary_records, which stays Admin/HR-only, matching
  // the "admin/HR see everything, employee sees a subset" access model.
  const [{ data: contracts }, { data: certificates }] = await Promise.all([
    supabase.from('contracts').select('id, contract_no, contract_type, status, start_date, end_date, position_th, department')
      .eq('user_id', session.id).order('created_at', { ascending: false }),
    supabase.from('employment_certificates').select('id, cert_no, cert_type, purpose, issued_date')
      .eq('user_id', session.id).order('created_at', { ascending: false }),
  ])

  return ok({ user: data, contracts: contracts ?? [], certificates: certificates ?? [] })
}

export async function PATCH(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('รูปแบบข้อมูลไม่ถูกต้อง')
  }

  const supabase = createAdminSupabaseClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const phone = form.get('phone')
  if (typeof phone === 'string') {
    if (phone.length > 30) return badRequest('เบอร์โทรยาวเกินไป')
    updates.phone = phone.trim() || null
  }

  // 2026-07-14: "ที่อยู่ปัจจุบัน" — used as the leave form's "ติดต่อได้ที่"
  // field, pulled live at PDF-render time (see leave-official-form-template.ts).
  const address = form.get('address')
  if (typeof address === 'string') {
    if (address.length > 300) return badRequest('ที่อยู่ยาวเกินไป')
    updates.address = address.trim() || null
  }

  const avatar = form.get('avatar')
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > MAX_FILE_BYTES) return badRequest('ไฟล์รูปใหญ่เกิน 2MB')
    if (!ALLOWED_MIME.includes(avatar.type)) return badRequest('ไฟล์ต้องเป็น JPG, PNG หรือ WEBP เท่านั้น')

    const ext = avatar.name.split('.').pop() || 'jpg'
    const path = `${session.id}/${Date.now()}.${ext}`
    const buf = await avatar.arrayBuffer()
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, buf, {
      contentType: avatar.type, upsert: true,
    })
    if (uploadErr) return serverError(new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadErr.message}`))
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    updates.avatar_url = pub.publicUrl
  }

  if (Object.keys(updates).length === 1) return badRequest('ไม่มีข้อมูลที่จะบันทึก')

  const { data: updated, error } = await supabase
    .from('users').update(updates).eq('id', session.id).select().single()
  if (error) return serverError(error)

  return ok(updated)
}
