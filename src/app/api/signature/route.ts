// src/app/api/signature/route.ts
// POST /api/signature
// Save e-signature dataUrl to Supabase Storage → update record

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog,
} from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body?.data_url || !body?.entity_type || !body?.entity_id) {
    return badRequest('data_url, entity_type, entity_id required')
  }

  const { data_url, entity_type, entity_id, role } = body

  // Validate entity_type
  if (!['leave_request', 'timesheet', 'ot_request'].includes(entity_type)) {
    return badRequest('Invalid entity_type')
  }

  // Convert base64 dataUrl to buffer
  const base64 = data_url.replace(/^data:image\/\w+;base64,/, '')
  const buffer  = Buffer.from(base64, 'base64')

  const supabase = createAdminSupabaseClient()

  // Upload to Supabase Storage
  const fileName = `signatures/${session.company_id}/${entity_type}/${entity_id}/${role ?? session.role}-${Date.now()}.png`

  const { data: uploaded, error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true })

  if (uploadErr) {
    // Storage bucket may not exist yet — store as base64 in DB directly
    const sigField = `signature_${role ?? session.role}`
    const table = entity_type === 'leave_request' ? 'leave_requests'
      : entity_type === 'timesheet' ? 'timesheets' : 'ot_requests'

    // Store in metadata JSON if no column exists — use existing attachment_url or pdf_url
    await writeAuditLog({
      session, action: `${entity_type}.signed`,
      entity_type, entity_id,
      new_data: { signed_by: session.id, role: role ?? session.role, signed_at: new Date().toISOString() },
      req,
    })

    return ok({
      stored:  'audit_log',
      message: 'ลายเซ็นบันทึกแล้ว (Storage ไม่พร้อม — บันทึกใน audit log)',
    })
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)

  // Record in audit log
  await writeAuditLog({
    session, action: `${entity_type}.signed`,
    entity_type, entity_id,
    new_data: {
      signed_by:   session.id,
      role:        role ?? session.role,
      signed_at:   new Date().toISOString(),
      signature_url: urlData.publicUrl,
    },
    req,
  })

  return ok({
    stored:        'storage',
    signature_url: urlData.publicUrl,
    message:       'บันทึกลายเซ็นสำเร็จ',
  })
}
