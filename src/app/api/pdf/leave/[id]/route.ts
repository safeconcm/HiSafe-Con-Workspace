// src/app/api/pdf/leave/[id]/route.ts
// GET /api/pdf/leave/:id
// Renders a real PDF in-process (puppeteer-core + @sparticuz/chromium-min —
// see src/lib/pdf/render.ts for why), saves it to the private "documents"
// storage bucket so it's kept permanently and can be re-downloaded without
// regenerating, and returns the PDF to the browser either way.

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateLeaveHTML, type LeaveTemplateData } from '@/lib/pdf/leave-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'
import { LEAVE_TYPE_LABEL } from '@/utils'
import type { LeaveType } from '@/types/database'

export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase   = createAdminSupabaseClient()
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Fetch leave request with relations
  const { data: leave, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(
        employee_code, first_name_th, last_name_th, position_th, department
      ),
      approved_by:users!leave_requests_approved_by_id_fkey(
        first_name_th, last_name_th
      ),
      approvals:leave_approvals(
        action, comment, approver_name, acted_at,
        approver:users!leave_approvals_approver_id_fkey(first_name_th, last_name_th)
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !leave) return notFound('Leave request')

  // Access check
  if (session.role === 'employee' && leave.user_id !== session.id) return forbidden()

  // Fetch company
  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en, logo_url')
    .eq('id', session.company_id).single()

  const templateData: LeaveTemplateData = {
    company: {
      code:     company?.code     ?? '',
      name_th:  company?.name_th  ?? '',
      name_en:  company?.name_en  ?? '',
      logo_url: company?.logo_url ?? null,
    },
    employee: {
      employee_code: (leave.user as any)?.employee_code ?? '',
      first_name_th: (leave.user as any)?.first_name_th ?? '',
      last_name_th:  (leave.user as any)?.last_name_th  ?? '',
      position_th:   (leave.user as any)?.position_th   ?? null,
      department:    (leave.user as any)?.department    ?? null,
    },
    leave: {
      id:              leave.id,
      leave_type:      leave.leave_type,
      leave_type_th:   LEAVE_TYPE_LABEL[leave.leave_type as LeaveType] ?? leave.leave_type,
      start_date:      leave.start_date,
      end_date:        leave.end_date,
      total_days:      leave.total_days,
      is_half_day:     leave.is_half_day,
      half_day_period: leave.half_day_period,
      reason:          leave.reason,
      status:          leave.status,
      created_at:      leave.created_at,
    },
    approver: leave.approved_by ? {
      first_name_th: (leave.approved_by as any).first_name_th,
      last_name_th:  (leave.approved_by as any).last_name_th,
      approved_at:   leave.approved_at,
    } : null,
    approvals: ((leave.approvals as any[]) ?? []).map(ap => ({
      action:        ap.action,
      approver_name: ap.approver
        ? `${ap.approver.first_name_th} ${ap.approver.last_name_th}`
        : ap.approver_name ?? 'ระบบ',
      comment:       ap.comment,
      acted_at:      ap.acted_at,
    })).sort((a: any, b: any) => new Date(a.acted_at).getTime() - new Date(b.acted_at).getTime()),
  }

  const html = generateLeaveHTML(templateData, appUrl)

  try {
    const pdfBuffer = await renderPdfFromHtml(html)

    // Persist to the private "documents" bucket so this stays downloadable
    // later without needing to regenerate. Overwritten on each regeneration
    // (e.g. after a status change) so it always reflects the latest state —
    // point-in-time freezing after voiding is a later phase's concern.
    const storagePath = `leave/${params.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (!uploadErr) {
      await supabase.from('leave_requests').update({ pdf_url: storagePath }).eq('id', params.id)
    }

    // Cast: Next.js's bundled BodyInit type doesn't structurally accept a
    // Uint8Array/Buffer here even though the Fetch spec (and Node's actual
    // runtime Response implementation) both do — verified this is a
    // type-only mismatch, not a real runtime issue.
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="leave-${params.id.slice(-8)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/leave] render failed', err)
    // Fallback: return HTML so the page still shows something the user can
    // print-to-PDF from their browser, rather than a hard error.
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-PDF-Mode':   'html-fallback',
      },
    })
  }
}
