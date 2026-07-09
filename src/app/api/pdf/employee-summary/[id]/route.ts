// src/app/api/pdf/employee-summary/[id]/route.ts
// GET /api/pdf/employee-summary/:id
// Renders a 1-page "Employee Profile Summary" PDF — basic info, current
// contract, reporting line, and this year's leave balances — the same data
// already shown across the admin "employee 360" page (see
// /api/admin/users/[id]), just condensed onto one printable page. Follows
// the same in-process render pattern as /api/pdf/leave, /api/pdf/certificate
// and /api/pdf/contract (see src/lib/pdf/render.ts). Unlike those, this
// document isn't persisted back onto a row (there's no single "employee
// summary" record to attach a file_url to) — it's generated fresh each time.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateEmployeeSummaryHTML, type EmployeeSummaryTemplateData } from '@/lib/pdf/employee-summary-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'

export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role === 'employee' && params.id !== session.id) return forbidden()

  const supabase = createAdminSupabaseClient()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !user) return notFound('User')

  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en')
    .eq('id', session.company_id).single()

  // Reporting line — same best-effort separate-query pattern as
  // /api/admin/users/[id] (a self-referencing 3-level embed on
  // organization_nodes reliably 400'd through PostgREST; see that route's
  // comment for the full story).
  const { data: orgNode } = await supabase
    .from('organization_nodes')
    .select('id, parent_id')
    .eq('user_id', params.id)
    .maybeSingle()

  let supervisor: { first_name_th: string; last_name_th: string } | null = null
  if (orgNode?.parent_id) {
    const { data: parentNode } = await supabase
      .from('organization_nodes')
      .select('user:users!organization_nodes_user_id_fkey(first_name_th, last_name_th)')
      .eq('id', orgNode.parent_id)
      .maybeSingle()
    supervisor = (parentNode?.user as any) ?? null
  }

  const currentYear = new Date().getFullYear()
  const [{ data: balances }, { data: contracts }] = await Promise.all([
    supabase.from('leave_balance_summary').select('*').eq('user_id', params.id).eq('year', currentYear),
    supabase.from('contracts').select('*').eq('user_id', params.id).order('created_at', { ascending: false }),
  ])

  // Prefer the active contract; fall back to the most recently created one
  // (e.g. a still-draft new hire) so the page isn't blank for them.
  const contract = (contracts ?? []).find(c => c.status === 'active') ?? (contracts ?? [])[0] ?? null

  const templateData: EmployeeSummaryTemplateData = {
    company: { code: company?.code ?? '', name_th: company?.name_th ?? '', name_en: company?.name_en ?? '' },
    employee: {
      employee_code: user.employee_code,
      first_name_th: user.first_name_th,
      last_name_th:  user.last_name_th,
      first_name_en: user.first_name_en,
      last_name_en:  user.last_name_en,
      position_th:   user.position_th,
      department:    user.department,
      role:          user.role,
      status:        user.status,
      hire_date:     user.hire_date,
      phone:         user.phone,
      email:         user.email,
      avatar_url:    user.avatar_url,
    },
    supervisor,
    contract: contract ? {
      contract_no:      contract.contract_no,
      contract_type:    contract.contract_type,
      status:           contract.status,
      start_date:       contract.start_date,
      end_date:         contract.end_date,
      work_location:    contract.work_location,
      probation_status: contract.probation_status,
      probation_end:    contract.probation_end,
    } : null,
    balances: (balances ?? []) as any,
    generated_at: new Date().toISOString(),
  }

  const html = generateEmployeeSummaryHTML(templateData, appUrl)

  try {
    const pdfBuffer = await renderPdfFromHtml(html)
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="employee-summary-${user.employee_code}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/employee-summary] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-PDF-Mode': 'html-fallback' },
    })
  }
}
