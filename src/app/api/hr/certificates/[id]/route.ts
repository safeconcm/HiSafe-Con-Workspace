// src/app/api/hr/certificates/[id]/route.ts
// PATCH /api/hr/certificates/:id — void an issued certificate.
//
// employment_certificates already had an `is_voided` boolean (and
// `void_reason` text) column, and the certificate PDF template
// (src/lib/pdf/certificate-template.ts) already renders a red "ยกเลิกแล้ว"
// watermark when is_voided is true — but nothing in the app ever actually
// set that column. This route is what's missing: an HR/admin-only action to
// void a certificate, with who/when recorded (voided_by_id/voided_at, added
// in this same change) and an audit log entry, mirroring the pattern used
// for every other state-changing action in this codebase (contract PATCH,
// leave approval, etc).
//
// See ./reissue/route.ts for "void this one and issue an identical
// replacement" as a single action.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, notFound,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  if (body.action !== 'void') return badRequest('action must be "void"')

  const reason = String(body.reason ?? '').trim()
  if (!reason) return badRequest('กรุณาระบุเหตุผลในการยกเลิก')

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('employment_certificates').select('*')
    .eq('id', params.id).eq('company_id', session.company_id).single()
  if (!existing) return notFound('Certificate')
  if (existing.is_voided) return badRequest('ใบรับรองนี้ถูกยกเลิกไปแล้ว')

  const { data, error } = await supabase
    .from('employment_certificates')
    .update({
      is_voided:    true,
      void_reason:  reason,
      voided_by_id: session.id,
      voided_at:    new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'certificate.voided', entity_type: 'certificate',
    entity_id: params.id, old_data: existing, new_data: data, req,
  })
  return ok(data)
}
