// src/lib/mailer.ts
// Sends outgoing email using each company's own SMTP settings (Admin →
// Settings → Email SMTP, stored on companies.smtp_*). Degrades gracefully
// (returns { ok: false }) instead of throwing when SMTP isn't configured
// yet, so callers (dispatchNotifications) never break on a missing setup.
//
// Note on Gmail/Google Workspace SMTP: Gmail rejects your normal account
// password over SMTP. The value saved in smtp_password must be a 16-char
// "App Password" generated from the Google Account's Security settings
// (requires 2-Step Verification to be turned on for that account first).

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'public' } }
  )
}

export async function sendCompanyEmail(params: {
  company_id: string
  to: string
  subject: string
  html: string
  // Inline images (e.g. the announcement/company-logo thumbnail) — pass a
  // cid here and reference it in `html` as `<img src="cid:XXX">`. This
  // embeds the image as part of the email itself instead of a remote
  // <img src="https://..."> link, which some mail clients block by default
  // until the user clicks "show images". Added 2026-07-12 per user request.
  attachments?: { filename: string; content: Buffer; cid: string }[]
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = adminClient()
  const { data: company, error } = await supabase
    .from('companies')
    .select('smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_from_name')
    .eq('id', params.company_id)
    .single()

  if (error || !company?.smtp_host || !company?.smtp_user || !company?.smtp_password || !company?.smtp_from) {
    return { ok: false, error: 'SMTP ยังไม่ได้ตั้งค่าสำหรับบริษัทนี้ (Admin > ตั้งค่า > Email SMTP)' }
  }

  try {
    const port = company.smtp_port ?? 587
    const transporter = nodemailer.createTransport({
      host: company.smtp_host,
      port,
      secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS (default)
      auth: { user: company.smtp_user, pass: company.smtp_password },
    })

    await transporter.sendMail({
      from: `"${company.smtp_from_name ?? 'CONNEX'}" <${company.smtp_from}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    })

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ส่งอีเมลไม่สำเร็จ (ไม่ทราบสาเหตุ)' }
  }
}
