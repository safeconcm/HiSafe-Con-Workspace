// src/app/api/pdf/jobs/route.ts
// GET /api/pdf/jobs?year=&status=&q=&groupBy= — "Job Codes" list export PDF
// (2026-10-21, "ควรจะ export ออกมาเป็น PDF excel csv"). Opened via
// window.open from the Jobs page's Export button (same pattern as the
// existing Timesheet/leave "แบบฟอร์มทางการ" PDF buttons — see
// src/app/access/jobs/page.tsx's exportPDF()).
//
// Re-fetches and re-filters/re-groups server-side (rather than trusting a
// client-assembled payload) using the exact same src/lib/jobs-grouping.ts
// logic the Jobs page itself uses, and the exact same 4-field search match
// (job_code/name_th/name_en/client_name) the page's client-side search box
// uses — so the PDF always matches what's on screen at the moment it's
// opened, not a stale or hand-reimplemented approximation of it.
import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient, unauthorized,
} from '@/lib/api-helpers'
import { generateJobCodesListHTML } from '@/lib/pdf/job-codes-list-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'
import type { JobGroupBy } from '@/lib/jobs-grouping'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const year    = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const status  = searchParams.get('status') ?? 'active'
  const q       = (searchParams.get('q') ?? '').trim().toLowerCase()
  const groupBy = (searchParams.get('groupBy') === 'client' ? 'client' : 'year') as JobGroupBy

  const supabase = createAdminSupabaseClient()

  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en, legal_name_th, address_th, tax_id, phone, contact_email')
    .eq('id', session.company_id).single()

  let query = supabase
    .from('jobs')
    .select('id, job_code, name_th, name_en, year, status, client_name, description, contract_value, contract_no, start_date, end_date, sequence_no')
    .eq('company_id', session.company_id)
    .eq('year', year)
    .order('job_code')
  if (status !== 'all') query = query.eq('status', status)

  const { data: allJobs, error } = await query
  if (error) {
    return new NextResponse(`เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}`, { status: 500 })
  }

  // Same 4-field match as the Jobs page's client-side search filter.
  const jobs = !q ? (allJobs ?? []) : (allJobs ?? []).filter(job =>
    [job.job_code, job.name_th, job.name_en, job.client_name]
      .some((v: string | null) => (v ?? '').toLowerCase().includes(q))
  )

  const revenueTotal = jobs.reduce<number | null>((sum, j) => {
    if (j.contract_value === null || j.contract_value === undefined) return sum
    return (sum ?? 0) + Number(j.contract_value)
  }, null)

  const html = generateJobCodesListHTML({
    company: {
      code: company?.code ?? '', name_th: company?.name_th ?? '', name_en: company?.name_en ?? '',
      legal_name_th: company?.legal_name_th ?? null, address_th: company?.address_th ?? null,
      tax_id: company?.tax_id ?? null, phone: company?.phone ?? null, contact_email: company?.contact_email ?? null,
    },
    year, groupBy, search: searchParams.get('q') ?? '',
    jobs, revenueTotal,
    generated_at: new Date().toISOString(),
  })

  try {
    const pdfBuffer = await renderPdfFromHtml(html, { landscape: true })
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="job_codes_${year}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/jobs] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
    })
  }
}
