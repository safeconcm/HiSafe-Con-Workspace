// src/app/api/pdf/timesheet/[id]/official/route.ts
// GET /api/pdf/timesheet/:id/official
// "พิมพ์แบบฟอร์มทางการ" — same timesheet data as the regular styled PDF
// (/api/pdf/timesheet/:id), but laid out on the company's real shared paper
// form instead (see timesheet-official-form-template.ts). Added 2026-07-16
// as an ADDITIVE second output — the regular styled PDF and its storage
// path (timesheet/:id.pdf) are untouched; this saves to a separate path
// (timesheet-official/:id.pdf) so neither overwrites the other.
//
// Landscape A4 (per user decision) — see render.ts's `landscape` option.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateTimesheetOfficialFormHTML, type TimesheetOfficialFormData } from '@/lib/pdf/timesheet-official-form-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'
import { getWorkingDayMapForMonth } from '@/lib/work-schedule'

export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: ts, error } = await supabase
    .from('timesheets')
    .select(`
      *,
      user:users!timesheets_user_id_fkey(
        first_name_en, last_name_en, first_name_th, last_name_th,
        position_en, position_th, nickname, based, resign_date, signature_url
      ),
      approved_by:users!timesheets_approved_by_id_fkey(signature_url),
      lines:timesheet_lines(
        work_date, hours, line_type, activity_code,
        job:jobs(job_code, name_th, name_en)
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !ts) return notFound('Timesheet')
  if (session.role === 'employee' && ts.user_id !== session.id) return forbidden()

  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en, legal_name_th')
    .eq('id', session.company_id).single()

  const monthPad = String(ts.month).padStart(2, '0')
  const { data: holidays } = await supabase
    .from('holidays')
    .select('holiday_date, name_th')
    .eq('company_id', session.company_id)
    .gte('holiday_date', `${ts.year}-${monthPad}-01`)
    .lte('holiday_date', `${ts.year}-${monthPad}-31`)
    .eq('is_active', true)

  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('leave_type, other_subtype, start_date, end_date, is_half_day')
    .eq('user_id', ts.user_id)
    .eq('status', 'approved')
    .lte('start_date', `${ts.year}-${monthPad}-31`)
    .gte('end_date',   `${ts.year}-${monthPad}-01`)

  const workingDayMap = await getWorkingDayMapForMonth(supabase, session.company_id, ts.year, ts.month)

  async function signatureDataUri(path: string | null): Promise<string | null> {
    if (!path) return null
    // signature_url may already be a public URL (see /api/profile/signature) —
    // only attempt a storage download for a bucket-relative path.
    if (path.startsWith('http')) return path
    const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(path)
    if (dlErr || !blob) return null
    const buf = Buffer.from(await blob.arrayBuffer())
    return `data:image/png;base64,${buf.toString('base64')}`
  }

  const [employeeSigUri, approverSigUri] = await Promise.all([
    signatureDataUri((ts.user as any)?.signature_url ?? null),
    signatureDataUri((ts.approved_by as any)?.signature_url ?? null),
  ])

  const templateData: TimesheetOfficialFormData = {
    company: {
      code: company?.code ?? '', name_th: company?.name_th ?? '',
      name_en: company?.name_en ?? null, legal_name_th: company?.legal_name_th ?? null,
    },
    employee: {
      first_name_en: (ts.user as any)?.first_name_en ?? null,
      last_name_en:  (ts.user as any)?.last_name_en  ?? null,
      first_name_th: (ts.user as any)?.first_name_th ?? '',
      last_name_th:  (ts.user as any)?.last_name_th  ?? '',
      position_en:   (ts.user as any)?.position_en   ?? null,
      position_th:   (ts.user as any)?.position_th   ?? null,
      nickname:      (ts.user as any)?.nickname       ?? null,
      based:         (ts.user as any)?.based          ?? null,
      resign_date:   (ts.user as any)?.resign_date     ?? null,
    },
    timesheet: { id: ts.id, year: ts.year, month: ts.month, approved_at: ts.approved_at },
    lines:    (ts.lines as any[]) ?? [],
    holidays: (holidays ?? []) as any[],
    leaves:   (leaves ?? []) as any[],
    workingDayMap,
    signatures: { employee_url: employeeSigUri, approver_url: approverSigUri },
  }

  const html = generateTimesheetOfficialFormHTML(templateData, appUrl)

  try {
    const pdfBuffer = await renderPdfFromHtml(html, { landscape: true })

    const storagePath = `timesheet-official/${params.id}.pdf`
    await supabase.storage.from('documents')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="timesheet-official-${ts.year}-${ts.month}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/timesheet/official] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
    })
  }
}
