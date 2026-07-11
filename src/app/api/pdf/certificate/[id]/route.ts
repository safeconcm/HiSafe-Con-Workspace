// src/app/api/pdf/certificate/[id]/route.ts
// GET /api/pdf/certificate/:id
// This route didn't exist at all before — the "print" button on
// /hr/certificates has always linked here and 404'd. Renders a real PDF
// in-process (see src/lib/pdf/render.ts) and persists it to the private
// "documents" storage bucket, mirroring /api/pdf/leave and /api/pdf/timesheet.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateCertificateHTML, type CertificateTemplateData } from '@/lib/pdf/certificate-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'

export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: cert, error } = await supabase
    .from('employment_certificates')
    .select(`
      *,
      user:users!employment_certificates_user_id_fkey(employee_code, first_name_th, last_name_th),
      issued_by:users!employment_certificates_issued_by_id_fkey(first_name_th, last_name_th)
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !cert) return notFound('Certificate')
  if (session.role === 'employee' && cert.user_id !== session.id) return forbidden()

  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en, legal_name_th, address_th, tax_id, phone, contact_email')
    .eq('id', session.company_id).single()

  const templateData: CertificateTemplateData = {
    company: {
      code: company?.code ?? '', name_th: company?.name_th ?? '', name_en: company?.name_en ?? '',
      legal_name_th: company?.legal_name_th ?? null, address_th: company?.address_th ?? null,
      tax_id: company?.tax_id ?? null, phone: company?.phone ?? null, contact_email: company?.contact_email ?? null,
    },
    employee: { ...(cert.user as any) },
    certificate: {
      id:             cert.id,
      cert_no:        cert.cert_no,
      cert_type:      cert.cert_type,
      purpose:        cert.purpose,
      issued_date:    cert.issued_date,
      position_th:    cert.position_th,
      department:     cert.department,
      hire_date:      cert.hire_date,
      salary_amount:  cert.salary_amount,
      include_salary: cert.include_salary,
      is_voided:      cert.is_voided,
    },
    issued_by: cert.issued_by as any ?? null,
  }

  const html = generateCertificateHTML(templateData, appUrl)

  try {
    const pdfBuffer = await renderPdfFromHtml(html)

    const storagePath = `certificate/${params.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (!uploadErr) {
      await supabase.from('employment_certificates').update({ file_url: storagePath }).eq('id', params.id)
    }

    // See src/app/api/pdf/leave/[id]/route.ts for why this cast is needed.
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="certificate-${cert.cert_no}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/certificate] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
    })
  }
}
