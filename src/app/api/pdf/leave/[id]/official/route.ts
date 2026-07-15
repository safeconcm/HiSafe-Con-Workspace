// src/app/api/pdf/leave/[id]/official/route.ts
// GET /api/pdf/leave/:id/official
// "พิมพ์แบบฟอร์มทางการ" — same leave-request data as the regular styled PDF
// (/api/pdf/leave/:id), but laid out on top of the company's real paper
// "ใบลา" form instead (see leave-official-form-template.ts). Added
// 2026-07-14 as an ADDITIVE second output — the regular styled PDF and its
// storage path (leave/:id.pdf) are untouched; this saves to a separate
// path (leave-official/:id.pdf) so neither overwrites the other.
import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, notFound,
} from '@/lib/api-helpers'
import { generateLeaveOfficialFormHTML, type LeaveOfficialFormData } from '@/lib/pdf/leave-official-form-template'
import { generateLeaveHTML, type LeaveTemplateData } from '@/lib/pdf/leave-template'
import { renderPdfFromHtml } from '@/lib/pdf/render'
import { LEAVE_TYPE_LABEL } from '@/utils'
import type { LeaveType } from '@/types/database'
import { PDFDocument } from 'pdf-lib'

// 2026-07-15: bumped from 30s — this route now renders TWO full PDFs
// (the official-form overlay + the system-styled PDF, per item 1.5) plus
// an optional medical-cert merge, so the old 30s budget got tighter.
export const maxDuration = 45

// A4 in pt — matches the base form's own page size (see
// leave-official-form-template.ts's html/body width/height).
const A4_WIDTH  = 595.32
const A4_HEIGHT = 841.92

// 2026-07-14 (part 2), item 2.4 — appends the medical certificate as an
// extra page. A PDF cert has its own pages copied in as-is; an image cert
// gets embedded, scaled to fit, and centered on a new A4 page.
async function appendMedicalCertPage(basePdf: Uint8Array, certBuf: Buffer, certMime: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(basePdf)

  if (certMime === 'application/pdf') {
    const certDoc = await PDFDocument.load(certBuf)
    const pages = await doc.copyPages(certDoc, certDoc.getPageIndices())
    pages.forEach(p => doc.addPage(p))
  } else {
    const img = certMime === 'image/png' ? await doc.embedPng(certBuf) : await doc.embedJpg(certBuf)
    const page = doc.addPage([A4_WIDTH, A4_HEIGHT])
    const margin = 30
    const scale  = Math.min((A4_WIDTH - margin * 2) / img.width, (A4_HEIGHT - margin * 2) / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    page.drawImage(img, { x: (A4_WIDTH - w) / 2, y: (A4_HEIGHT - h) / 2, width: w, height: h })
  }

  return doc.save()
}

// 2026-07-15, item 1.5: appends another PDF's pages as-is — used to attach
// the regular system-styled leave PDF (leave-template.ts) as reference
// pages after the official form, so whoever prints/checks the official
// form can cross-check it against the system's own record on paper.
async function appendPdfPages(basePdf: Uint8Array, otherPdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(basePdf)
  const otherDoc = await PDFDocument.load(otherPdf)
  const pages = await doc.copyPages(otherDoc, otherDoc.getPageIndices())
  pages.forEach(p => doc.addPage(p))
  return doc.save()
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: leave, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(
        employee_code, first_name_th, last_name_th, position_th, department, address, phone
      ),
      approved_by:users!leave_requests_approved_by_id_fkey(
        first_name_th, last_name_th, position_th
      ),
      hr_checked_by:users!leave_requests_hr_checked_by_id_fkey(
        first_name_th, last_name_th, position_th
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
  if (session.role === 'employee' && leave.user_id !== session.id) return forbidden()

  // 2026-07-15: full company row (not just `code`) — needed to also render
  // the system-styled PDF (see appendPdfPages / item 1.5 below), which uses
  // the same header/letterhead fields as leave-template.ts's other caller.
  const { data: company } = await supabase
    .from('companies').select('code, name_th, name_en, logo_url, legal_name_th, address_th, tax_id, phone, contact_email')
    .eq('id', session.company_id).single()

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

  // Same "สถิติการลาในปีนี้" calc as the regular PDF route.
  const leaveYear = new Date(leave.start_date).getFullYear()
  const { data: balanceRows } = await supabase
    .from('leave_balances')
    .select('leave_type, used_days')
    .eq('user_id', leave.user_id)
    .eq('year', leaveYear)

  const STATS_TYPES: { type: 'sick' | 'personal' | 'annual' | 'other' }[] = [
    { type: 'sick' }, { type: 'personal' }, { type: 'annual' }, { type: 'other' },
  ]
  const balanceStats = STATS_TYPES.map(({ type }) => {
    const usedDays = (balanceRows ?? []).find((b: any) => b.leave_type === type)?.used_days ?? 0
    const isThisType = type === leave.leave_type
    const thisTime = isThisType ? Number(leave.total_days) : 0
    const usedBefore = isThisType && leave.status === 'approved'
      ? Math.max(Number(usedDays) - thisTime, 0)
      : Number(usedDays)
    return { leave_type: type, used_before: usedBefore, this_time: thisTime, total: usedBefore + thisTime }
  })

  const approvedEntry = ((leave.approvals as any[]) ?? [])
    .find(a => a.action === 'approved' || a.action === 'auto_approved')

  const templateData: LeaveOfficialFormData = {
    company: { code: company?.code ?? '' },
    employee: {
      first_name_th: (leave.user as any)?.first_name_th ?? '',
      last_name_th:  (leave.user as any)?.last_name_th  ?? '',
      position_th:   (leave.user as any)?.position_th   ?? null,
      address:       (leave.user as any)?.address        ?? null,
      phone:         (leave.user as any)?.phone          ?? null,
    },
    leave: {
      leave_type:            leave.leave_type,
      start_date:            leave.start_date,
      end_date:              leave.end_date,
      total_days:            leave.total_days,
      reason:                leave.reason,
      status:                leave.status,
      created_at:            leave.created_at,
      place_written:         leave.place_written ?? null,
      contact_during_leave:  leave.contact_during_leave ?? null,
      medical_cert_provided: leave.medical_cert_provided ?? null,
    },
    approver: leave.approved_by ? {
      first_name_th: (leave.approved_by as any).first_name_th,
      last_name_th:  (leave.approved_by as any).last_name_th,
      position_th:   (leave.approved_by as any).position_th ?? null,
      approved_at:   leave.approved_at,
      comment:       approvedEntry?.comment ?? null,
    } : null,
    hrChecker: leave.hr_checked_by ? {
      first_name_th: (leave.hr_checked_by as any).first_name_th,
      last_name_th:  (leave.hr_checked_by as any).last_name_th,
      position_th:   (leave.hr_checked_by as any).position_th ?? null,
      checked_at:    leave.hr_checked_at,
    } : null,
    signatures: {
      employee_url: employeeSigUri,
      approver_url: approverSigUri,
      hr_url:       hrSigUri,
    },
    balanceStats,
  }

  const html = generateLeaveOfficialFormHTML(templateData, appUrl)

  // 2026-07-15, item 1.5: also render the regular system-styled PDF (same
  // one behind the "ดาวน์โหลด PDF" button) so it can be attached as
  // reference pages after the official form. Built from the SAME `leave`
  // row already fetched above — mirrors src/app/api/pdf/leave/[id]/
  // route.ts's own mapping so the two stay visually identical.
  const styledTemplateData: LeaveTemplateData = {
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
    balanceStats: balanceStats.map(s => ({
      leave_type:    s.leave_type,
      leave_type_th: ({ sick: 'ป่วย', personal: 'กิจส่วนตัว', annual: 'ลาพักร้อน', other: 'อื่นๆ' } as Record<string, string>)[s.leave_type],
      used_before:   s.used_before, this_time: s.this_time, total: s.total,
    })),
  }
  const styledHtml = generateLeaveHTML(styledTemplateData, appUrl)

  try {
    // Zero margin — the overlay coordinates were measured assuming the page
    // starts flush at (0,0), matching the background image 1:1. See
    // render.ts's opts.margin comment.
    let pdfBuffer: Uint8Array = await renderPdfFromHtml(html, { margin: { top: '0', bottom: '0', left: '0', right: '0' } })

    // item 1.5: attach the system-styled PDF right after the official
    // form, as a reference page — non-fatal if it fails, the official form
    // itself still renders fine on its own.
    try {
      const styledPdfBuffer = await renderPdfFromHtml(styledHtml)
      pdfBuffer = await appendPdfPages(pdfBuffer, styledPdfBuffer)
    } catch (styledErr) {
      console.error('[pdf/leave/official] styled-PDF attach failed', styledErr)
    }

    // 2026-07-14 (part 2), item 2.4: sick leave + "มีใบรับรองแพทย์" +
    // an actual uploaded file → append it as an extra page after the form
    // itself, official-form PDF only (per user decision). PDFs get their
    // pages copied in as-is; images get embedded centered on a new A4 page.
    if (leave.leave_type === 'sick' && leave.medical_cert_provided && leave.medical_cert_url) {
      try {
        const { data: certBlob } = await supabase.storage.from('documents').download(leave.medical_cert_url)
        if (certBlob) {
          const certBuf = Buffer.from(await certBlob.arrayBuffer())
          pdfBuffer = await appendMedicalCertPage(pdfBuffer, certBuf, certBlob.type || 'application/pdf')
        }
      } catch (mergeErr) {
        // Non-fatal — the form itself still renders fine without the cert
        // page attached; the "มี/ไม่มี" checkbox on the form already shows
        // whether a certificate exists.
        console.error('[pdf/leave/official] medical cert merge failed', mergeErr)
      }
    }

    const storagePath = `leave-official/${params.id}.pdf`
    await supabase.storage.from('documents')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="leave-official-${params.id.slice(-8)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[pdf/leave/official] render failed', err)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-PDF-Mode':   'html-fallback',
      },
    })
  }
}
