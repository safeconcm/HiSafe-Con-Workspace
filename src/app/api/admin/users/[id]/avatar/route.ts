// src/app/api/admin/users/[id]/avatar/route.ts
// POST — Admin uploads/replaces a profile photo on behalf of any employee
// in their company (multipart/form-data, field "avatar"). Reuses the same
// public "avatars" bucket as the self-service /api/profile route.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound, serverError,
} from '@/lib/api-helpers'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('users').select('id').eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('User')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('รูปแบบข้อมูลไม่ถูกต้อง')
  }

  const avatar = form.get('avatar')
  if (!(avatar instanceof File) || avatar.size === 0) return badRequest('กรุณาแนบไฟล์รูปภาพ')
  if (avatar.size > MAX_FILE_BYTES) return badRequest('ไฟล์รูปใหญ่เกิน 2MB')
  if (!ALLOWED_MIME.includes(avatar.type)) return badRequest('ไฟล์ต้องเป็น JPG, PNG หรือ WEBP เท่านั้น')

  const ext = avatar.name.split('.').pop() || 'jpg'
  const path = `${params.id}/${Date.now()}.${ext}`
  const buf = await avatar.arrayBuffer()
  const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, buf, {
    contentType: avatar.type, upsert: true,
  })
  if (uploadErr) return serverError(new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadErr.message}`))
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)

  const { data: updated, error } = await supabase
    .from('users').update({ avatar_url: pub.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single()
  if (error) return serverError(error)

  return ok(updated)
}
