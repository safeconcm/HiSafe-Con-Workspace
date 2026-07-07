// src/app/api/pdf/timesheet/[id]/route.ts
// GET /api/pdf/timesheet/:id

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateTimesheetHTML, type TimesheetTemplateData } from '@/lib/pdf/timesheet-template'

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
  }

  const html = generateTimesheetHTML(templateData, appUrl)

  // Try worker service
  const workerUrl = process.env.WORKER_SERVICE_URL
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl}/pdf/generate`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    process.env.WORKER_API_KEY ?? '',
        },
        body: JSON.stringify({ html, filename: `timesheet-${params.id}.pdf` }),
      })
      if (res.ok) {
        const pdf = await res.arrayBuffer()
        return new NextResponse(pdf, {
          status: 200,
          headers: {
            'Content-Type':        'application/pdf',
            'Content-Disposition': `inline; filename="timesheet-${ts.year}-${ts.month}.pdf"`,
          },
        })
      }
    } catch { /* fallthrough */ }
  }

  // HTML fallback
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
  })
}
