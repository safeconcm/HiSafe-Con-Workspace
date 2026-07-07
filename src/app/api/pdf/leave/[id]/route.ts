// src/app/api/pdf/leave/[id]/route.ts
// GET /api/pdf/leave/:id
// Generates Leave PDF using html-pdf-node (lighter than Puppeteer for edge)
// Falls back to returning HTML if pdf generation unavailable

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound, serverError,
} from '@/lib/api-helpers'
import { generateLeaveHTML, type LeaveTemplateData } from '@/lib/pdf/leave-template'
import { LEAVE_TYPE_LABEL } from '@/utils'
import type { LeaveType } from '@/types/database'

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

  // Try to generate PDF via worker service if available
  const workerUrl = process.env.WORKER_SERVICE_URL
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl}/pdf/generate`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    process.env.WORKER_API_KEY ?? '',
        },
        body: JSON.stringify({ html, filename: `leave-${params.id}.pdf` }),
      })
      if (res.ok) {
        const pdfBuffer = await res.arrayBuffer()

        // Save PDF URL to leave request
        await supabase.from('leave_requests')
          .update({ pdf_url: `${appUrl}/api/pdf/leave/${params.id}` })
          .eq('id', params.id)

        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type':        'application/pdf',
            'Content-Disposition': `inline; filename="leave-${params.id.slice(-8)}.pdf"`,
          },
        })
      }
    } catch { /* fall through to HTML */ }
  }

  // Fallback: return HTML (user can print-to-PDF from browser)
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-PDF-Mode':   'html-fallback',
    },
  })
}
