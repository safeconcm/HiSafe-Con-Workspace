// src/app/api/pdf/contract/[id]/route.ts
// GET /api/pdf/contract/:id
// Renders the employment contract as a real PDF (see src/lib/pdf/render.ts)
// and persists it to the private "documents" storage bucket, mirroring
// /api/pdf/leave, /api/pdf/timesheet and /api/pdf/certificate.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateContractHTML, type ContractTemplateData } from '@/lib/pdf/contract-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'

export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: contract, error } = await supabase
    .from('contracts')
    .select(`
      *,
      user:users!contracts_user_id_fkey(employee_code, first_name_th, last_name_th),
      created_by_user:users!contracts_created_by_fkey(first_name_th, last_name_th)
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !contract) return notFound('Contract')
  if (session.role === 'employee' && contract.user_id !== session.id) return forbidden()

  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en, legal_name_th, address_th, tax_id, phone, contact_email')
    .eq('id', session.company_id).single()

  const templateData: ContractTemplateData = {
    company: {
      code: company?.code ?? '', name_th: company?.name_th ?? '', name_en: company?.name_en ?? '',
      legal_name_th: company?.legal_name_th ?? null, address_th: company?.address_th ?? null,
      tax_id: company?.tax_id ?? null, phone: company?.phone ?? null, contact_email: company?.contact_email ?? null,
    },
    employee: { ...(contract.user as any) },
    contract: {
      id:                  contract.id,
      contract_no:         contract.contract_no,
      contract_type:       contract.contract_type,
      status:              contract.status,
      start_date:          contract.start_date,
      end_date:            contract.end_date,
      position_th:         contract.position_th,
      position_en:         contract.position_en,
      department:          contract.department,
      work_location:       contract.work_location,
      probation_days:      contract.probation_days ?? 0,
      probation_end:       contract.probation_end,
      base_salary:         contract.base_salary,
      salary_type:         contract.salary_type,
      overtime_rate:       contract.overtime_rate,
      allowances:          contract.allowances,
      benefits:            contract.benefits,
      notice_days:         contract.notice_days,
      notes:               contract.notes,
      signed_by_employee:  !!contract.signed_by_employee,
      signed_by_hr:        !!contract.signed_by_hr,
      signed_at:           contract.signed_at,
      created_at:          contract.created_at,
    },
    authorized_signer: contract.created_by_user as any ?? null,
  }

  const html = generateContractHTML(templateData, appUrl)

  try {
    const pdfBuffer = await renderPdfFromHtml(html)

    const storagePath = `contract/${params.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (!uploadErr) {
      await supabase.from('contracts').update({ file_url: storagePath }).eq('id', params.id)
    }

    // See src/app/api/pdf/leave/[id]/route.ts for why this cast is needed.
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="contract-${contract.contract_no}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/contract] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
    })
  }
}
