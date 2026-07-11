// src/app/api/profile/signature/route.ts
// Self-service e-signature — every user draws/saves their OWN signature
// once here, and it's reused automatically wherever they act:
//   - submitting a leave request auto-attaches it as the requester's signature
//   - approving a leave request auto-attaches it as the approver's signature
// There is no separate "sign this document" step anymore, and no HR-only
// signing identity — whoever acts (requests or approves) signs with their
// own saved signature at that same moment. See /api/leave (POST) and
// /api/leave/[id]/approve for where this gets auto-attached.
//
// GET  — { has_signature, signature_url (signed, short-lived), updated_at }
// POST — { data_url } data:image/png;base64,... from SignatureCanvas → saves/overwrites

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, serverError, writeAuditLog,
} from '@/lib/api-helpers'

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour — plenty for viewing one page

function signaturePath(companyId: string, userId: string) {
  // Fixed path per user (no timestamp) — a new save overwrites the same
  // object via upsert, since only the latest signature should ever be live.
  return `signatures/${companyId}/users/${userId}/signature.png`
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const { data: user, error } = await supabase
    .from('users')
    .select('signature_url, signature_updated_at')
    .eq('id', session.id)
    .single()
  if (error) return serverError(error)

  if (!user?.signature_url) {
    return ok({ has_signature: false, signature_url: null, updated_at: null })
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from('documents')
    .createSignedUrl(user.signature_url, SIGNED_URL_TTL_SECONDS)
  if (signErr) return serverError(signErr)

  return ok({
    has_signature: true,
    signature_url: signed.signedUrl,
    updated_at:    user.signature_updated_at,
  })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body?.data_url) return badRequest('data_url required')

  const base64 = String(body.data_url).replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) return badRequest('ลายเซ็นว่างเปล่า')
  if (buffer.length > 500 * 1024) return badRequest('ไฟล์ลายเซ็นใหญ่เกินไป')

  const supabase = createAdminSupabaseClient()
  const path = signaturePath(session.company_id, session.id)

  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(path, buffer, { contentType: 'image/png', upsert: true })
  if (uploadErr) return serverError(uploadErr)

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('users')
    .update({ signature_url: path, signature_updated_at: now })
    .eq('id', session.id)
  if (updateErr) return serverError(updateErr)

  await writeAuditLog({
    session, action: 'user.signature_saved', entity_type: 'user',
    entity_id: session.id, new_data: { signature_updated_at: now }, req,
  })

  const { data: signed } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  return ok({ has_signature: true, signature_url: signed?.signedUrl ?? null, updated_at: now })
}
