// src/app/api/admin/settings/route.ts
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError, writeAuditLog,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const supabase = createAdminSupabaseClient()
  // NOTE: previously this select omitted smtp_password, line_oa_channel_secret,
  // and line_oa_access_token entirely — so PATCH saved them fine, but the
  // settings page's GET-then-prefill-form effect (see admin/settings/page.tsx)
  // always got `undefined` back for these three fields and rendered them
  // empty, making it look like the save silently failed/was wiped. This
  // endpoint is already admin-only (see the role check above), consistent
  // with the rest of the app trusting an authenticated admin session with
  // this kind of data, so there's no security reason to withhold them.
  const { data, error } = await supabase
    .from('companies')
    .select(`
      id,code,name_th,name_en,logo_url,
      legal_name_th,address_th,tax_id,phone,contact_email,
      smtp_host,smtp_port,smtp_user,smtp_password,smtp_from,smtp_from_name,
      line_oa_channel_id,line_oa_channel_secret,line_oa_access_token
    `)
    .eq('id', session.company_id)
    .single()

  if (error) return serverError(error)
  return ok(data)
}

export async function PATCH(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body    = await req.json().catch(() => ({}))
  const allowed = [
    'legal_name_th','address_th','tax_id','phone','contact_email',
    'smtp_host','smtp_port','smtp_user','smtp_password','smtp_from','smtp_from_name',
    'line_oa_channel_id','line_oa_channel_secret','line_oa_access_token',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body && body[key] !== '') updates[key] = body[key]
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('companies').update(updates).eq('id', session.company_id)
    .select('id,code,name_th').single()
  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'company.settings_updated', entity_type: 'company',
    entity_id: session.company_id,
    new_data: { ...updates, smtp_password: '[redacted]', line_oa_channel_secret: '[redacted]', line_oa_access_token: '[redacted]' },
    req,
  })

  return ok(data)
}
