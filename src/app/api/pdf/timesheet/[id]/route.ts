// src/app/api/pdf/timesheet/[id]/route.ts
// GET /api/pdf/timesheet/:id
// See src/app/api/pdf/leave/[id]/route.ts for why this renders in-process
// instead of calling the never-configured WORKER_SERVICE_URL.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateTimesheetHTML, type TimesheetTemplateData } from '@/lib/pdf/timesheet-template'
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
        employee_code, first_name_th, last_name_th, position_th, department
      ),
      approved_by:users!timesheets_approved_by_id_fkey(first_name_th, last_name_th),
      lines:timesheet_lines(
        work_date, hours, line_type, remark,
        job:jobs(job_code, name_th)
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !ts) return notFound('Timesheet')
  if (session.role === 'employee' && ts.user_id !== session.id) return forbidden()

  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en')
    .eq('id', session.company_id).single()

  // Fetch holidays for this month
  const monthPad = String(ts.month).padStart(2, '0')
  const { data: holidays } = await supabase
    .from('holidays')
    .select('holiday_date, name_th')
    .eq('company_id', session.company_id)
    .gte('holiday_date', `${ts.year}-${monthPad}-01`)
    .lte('holiday_date', `${ts.year}-${monthPad}-31`)
    .eq('is_active', true)

  const workingDayMap = await getWorkingDayMapForMonth(supabase, session.company_id, ts.year, ts.month)

  const templateData: TimesheetTemplateData = {
    company:   { code: company?.code ?? '', name_th: company?.name_th ?? '', name_en: company?.name_en ?? '' },
    employee:  { ...(ts.user as any) },
    timesheet: {
      id:          ts.id,
      year:        ts.year,
      month:       ts.month,
      status:      ts.status,
      total_hours: ts.total_hours,
      approved_at: ts.approved_at,
    },
    lines:    (ts.lines as any[]) ?? [],
    approver: ts.approved_by as any ?? null,
    holidays: (holidays ?? []) as any[],
    workingDayMap,
  }

  const html = generateTimesheetHTML(templateData, appUrl)

  try {
    const pdfBuffer = await renderPdfFromHtml(html)

    const storagePath = `timesheet/${params.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (!uploadErr) {
      await supabase.from('timesheets').update({ pdf_url: storagePath }).eq('id', params.id)
    }

    // See src/app/api/pdf/leave/[id]/route.ts for why this cast is needed.
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="timesheet-${ts.year}-${ts.month}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/timesheet] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
    })
  }
}
