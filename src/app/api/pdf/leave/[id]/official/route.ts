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
import { renderPdfFromHtml } from '@/lib/pdf/render'
import { PDFDocument } from 'pdf-lib'

export const maxDuration = 30

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
        action, comment, acted_at
      )
    `)
    .eq('id', params.id)
    .eq('company_id', session.company_id)
    .single()

  if (error || !leave) return notFound('Leave request')
  if (session.role === 'employee' && leave.user_id !== session.id) return forbidden()

  const { data: company } = await supabase
    .from('companies').select('code').eq('id', session.company_id).single()

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

  try {
    // Zero margin — the overlay coordinates were measured assuming the page
    // starts flush at (0,0), matching the background image 1:1. See
    // render.ts's opts.margin comment.
    let pdfBuffer: Uint8Array = await renderPdfFromHtml(html, { margin: { top: '0', bottom: '0', left: '0', right: '0' } })

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
