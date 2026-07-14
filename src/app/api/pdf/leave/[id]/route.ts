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
        employee_code, first_name_th, last_name_th, position_th, department, address, phone
      ),
      approved_by:users!leave_requests_approved_by_id_fkey(
        first_name_th, last_name_th
      ),
      hr_checked_by:users!leave_requests_hr_checked_by_id_fkey(
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
    .from('companies').select('code, name_th, name_en, logo_url, legal_name_th, address_th, tax_id, phone, contact_email')
    .eq('id', session.company_id).single()

  // Signatures are stored as storage PATHs (not public URLs — "documents"
  // is a private bucket), so download the bytes here with the service-role
  // client and inline them as data: URIs. This avoids Puppeteer having to
  // fetch anything over the network for an <img src>, same reasoning as
  // src/lib/pdf/render.ts's local Chromium bundle: network self-fetches
  // inside the render step have already burned us once this project.
  async function signatureDataUri(path: string | null): Promise<string | null> {
    if (!path) return null
    const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(path)
    if (dlErr || !blob) return null
    const buf = Buffer.from(await blob.arrayBuffer())
    return `data:image/png;base64,${buf.toString('base64')}`
  }

  const [employeeSigUri, approverSigUri, hrSigUri] = await Promise.all([
    signatureDataUri(leave.signature_employee_url ?? null),
    signatureDataUri(leave.signature_approver_url ?? null),
    signatureDataUri(leave.signature_hr_url ?? null),
  ])

  // 2026-07-14: "สถิติการลาในปีนี้" stats table — the 4 types shown on the
  // paper form (maternity isn't on the paper form, so it's excluded here).
  // "ลามาแล้ว" backs out this request's own days from used_days for its own
  // type (only meaningful once status is 'approved', since used_days only
  // reflects this request after approval — see /api/leave/[id]/approve).
  const leaveYear = new Date(leave.start_date).getFullYear()
  const { data: balanceRows } = await supabase
    .from('leave_balances')
    .select('leave_type, used_days')
    .eq('user_id', leave.user_id)
    .eq('year', leaveYear)

  const STATS_TYPES: { type: string; th: string }[] = [
    { type: 'sick',     th: 'ป่วย' },
    { type: 'personal', th: 'กิจส่วนตัว' },
    { type: 'annual',   th: 'ลาพักร้อน' },
    { type: 'other',    th: 'อื่นๆ' },
  ]
  const balanceStats = STATS_TYPES.map(({ type, th }) => {
    const usedDays = (balanceRows ?? []).find((b: any) => b.leave_type === type)?.used_days ?? 0
    const isThisType = type === leave.leave_type
    const thisTime = isThisType ? Number(leave.total_days) : 0
    const usedBefore = isThisType && leave.status === 'approved'
      ? Math.max(Number(usedDays) - thisTime, 0)
      : Number(usedDays)
    return {
      leave_type: type, leave_type_th: th,
      used_before: usedBefore, this_time: thisTime, total: usedBefore + thisTime,
    }
  })

  const templateData: LeaveTemplateData = {
    company: {
      code:     company?.code     ?? '',
      name_th:  company?.name_th  ?? '',
      name_en:  company?.name_en  ?? '',
      logo_url: company?.logo_url ?? null,
      legal_name_th: company?.legal_name_th ?? null,
      address_th:    company?.address_th    ?? null,
      tax_id:        company?.tax_id        ?? null,
      phone:         company?.phone         ?? null,
      contact_email: company?.contact_email ?? null,
    },
    employee: {
      employee_code: (leave.user as any)?.employee_code ?? '',
      first_name_th: (leave.user as any)?.first_name_th ?? '',
      last_name_th:  (leave.user as any)?.last_name_th  ?? '',
      position_th:   (leave.user as any)?.position_th   ?? null,
      department:    (leave.user as any)?.department    ?? null,
      address:       (leave.user as any)?.address        ?? null,
      phone:         (leave.user as any)?.phone          ?? null,
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
      place_written:          leave.place_written ?? null,
      contact_during_leave:   leave.contact_during_leave ?? null,
      medical_cert_provided:  leave.medical_cert_provided ?? null,
    },
    approver: leave.approved_by ? {
      first_name_th: (leave.approved_by as any).first_name_th,
      last_name_th:  (leave.approved_by as any).last_name_th,
      approved_at:   leave.approved_at,
    } : null,
    hrChecker: leave.hr_checked_by ? {
      first_name_th: (leave.hr_checked_by as any).first_name_th,
      last_name_th:  (leave.hr_checked_by as any).last_name_th,
      checked_at:    leave.hr_checked_at,
    } : null,
    signatures: {
      employee_url: employeeSigUri,
      employee_at:  leave.signature_employee_at ?? null,
      approver_url: approverSigUri,
      approver_at:  leave.signature_approver_at  ?? null,
      hr_url:       hrSigUri,
      hr_at:        leave.hr_checked_at ?? null,
    },
    approvals: ((leave.approvals as any[]) ?? []).map(ap => ({
      action:        ap.action,
      approver_name: ap.approver
        ? `${ap.approver.first_name_th} ${ap.approver.last_name_th}`
        : ap.approver_name ?? 'ระบบ',
      comment:       ap.comment,
      acted_at:      ap.acted_at,
    })).sort((a: any, b: any) => new Date(a.acted_at).getTime() - new Date(b.acted_at).getTime()),
    balanceStats,
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
