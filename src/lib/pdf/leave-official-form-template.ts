// src/lib/pdf/leave-official-form-template.ts
// "พิมพ์แบบฟอร์มทางการ" — overlays leave-request data on top of the
// company's actual official paper "ใบลา" form (scanned/exported to
// public/forms/leave-form-bg.png), positioned at the exact point
// coordinates measured from the source PDF (src/app/api/pdf/leave/[id]/
// official/route.ts fetches the data; this file only lays it out).
//
// 2026-07-14, per user request: "print out ให้เหมือนแบบฟอร์มจริง" — this is
// an ADDITIVE second PDF output, not a replacement for the existing
// branded/styled leave-template.ts. Both stay available (see the "ดาวน์โหลด
// PDF" vs "พิมพ์แบบฟอร์มทางการ" buttons on the leave detail page).
//
// Coordinate system: all x/y are in "pt" (1pt = 1/72in, same unit the source
// PDF itself uses), top-left origin, matching a 595.32×841.92pt page
// (≈ A4) with ZERO page margin — see render.ts's optional `opts.margin`
// override, used only by this template's route. The background image is a
// 1:1 render of the real form at 200dpi, with the original SAFECON logo
// whited out so either company's logo can be overlaid on top at the same
// spot (per user confirmation: Highcon uses the identical layout, just a
// different logo).

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function dateParts(dateStr: string | null): { day: string; month: string; year: string } {
  if (!dateStr) return { day: '', month: '', year: '' }
  const d = new Date(dateStr)
  return {
    day:   String(d.getDate()),
    month: TH_MONTHS[d.getMonth()],
    year:  String(d.getFullYear() + 543),
  }
}

const LEAVE_TYPE_CHECKBOX: Record<string, 'sick' | 'personal' | 'annual' | 'other'> = {
  sick: 'sick', personal: 'personal', annual: 'annual', other: 'other',
  // The paper form has no "ลาคลอด" (maternity) box — mark "อื่นๆ" and note
  // it in the free-text blank instead (see reasonText below).
  maternity: 'other',
}

// 2026-07-15: item 2.2 originally tried to parse just the department name
// out of the supervisor's position_th to fill into the pre-printed "เรียน
// ผู้จัดการฝ่าย ___" line (e.g. "ผู้จัดการแผนกออกแบบ" → "ออกแบบ"). Per user
// feedback this read as confusing/inconsistent once real data was on the
// page, so that whole pre-printed line is now whited out (see
// POS.dept_manager_cover) and replaced with the supervisor's full,
// unparsed position_th instead — no more parsing needed.

export interface LeaveOfficialFormData {
  company: { code: string }
  employee: {
    first_name_th: string
    last_name_th:  string
    position_th:   string | null
    // 2026-07-14 (part 2): pulled live from Profile (users.address/phone)
    // at render time — items 2.5/2.6 no longer come from the leave request
    // itself (see contact_during_leave deprecation note in the create form).
    address:        string | null
    phone:          string | null
  }
  leave: {
    leave_type:             string
    start_date:             string
    end_date:                string
    total_days:              number
    reason:                  string | null
    status:                  string
    created_at:              string
    place_written:           string | null
    contact_during_leave:    string | null
    medical_cert_provided:   boolean | null
  }
  approver: {
    first_name_th: string
    last_name_th:  string
    position_th:   string | null
    approved_at:   string | null
    comment:       string | null
  } | null
  hrChecker: {
    first_name_th: string
    last_name_th:  string
    position_th:   string | null
    checked_at:    string | null
  } | null
  signatures: {
    employee_url?: string | null
    approver_url?: string | null
    hr_url?:       string | null
  }
  balanceStats: {
    leave_type:  'sick' | 'personal' | 'annual' | 'other'
    used_before: number
    this_time:   number
    total:       number
  }[]
}

// Absolute position (top-left, pt) for every dynamic field — measured
// directly from the source PDF's text/drawing coordinates (see the
// migration/investigation notes for how these were extracted).
const POS = {
  logo:              { left: 41.8,  top: 31.5,  width: 48.4 },
  place_written:     { left: 378,   top: 116 },
  written_day:       { left: 337,   top: 136 },
  written_month:     { left: 401,   top: 136 },
  written_year:      { left: 505,   top: 136 },
  // 2026-07-15: the pre-printed "เรียน ผู้จัดการฝ่าย ....................."
  // line (measured at x:72.7-310.3pt, y:171-193pt on the source form) reads
  // confusingly once a real position title is appended after it — per user
  // request, this whole line gets whited out (dept_manager_cover) and
  // replaced with "เรียน " + the approver's own position_th (round 3, item
  // 1.1 — dropping the pre-printed "เรียน" made the line feel too abrupt,
  // so it's re-added as part of the dynamic text instead, right before the
  // live position title). No dotted line. Cover rect sampled as pure white
  // (255,255,255) against the scanned background, so a plain white patch
  // blends in seamlessly.
  dept_manager_cover: { left: 55,  top: 170, width: 275, height: 24 },
  dept_manager:      { left: 60,   top: 176 },
  employee_name:     { left: 143,   top: 216 },
  employee_position: { left: 414,   top: 216 },

  cb_sick:      { left: 162.75, top: 262.25 },
  cb_personal:  { left: 162.75, top: 283.45 },
  cb_annual:    { left: 162.75, top: 303.55 },
  cb_other:     { left: 163.75, top: 327.25 },
  cb_medcert_yes: { left: 285.35, top: 263.15 },
  cb_medcert_no:  { left: 313.8,  top: 263.15 },

  personal_reason: { left: 291, top: 277 },
  other_reason:    { left: 207, top: 317 },

  from_day: { left: 115, top: 358 },
  from_month: { left: 169, top: 358 },
  from_year: { left: 235, top: 358 },
  to_day:   { left: 302, top: 358 },
  to_month: { left: 350, top: 358 },
  to_year:  { left: 412, top: 358 },
  total_days: { left: 481, top: 358 },

  contact_address: { left: 206, top: 378 },
  contact_phone:   { left: 145, top: 398 },

  // 2026-07-14 (part 2), items 2.7/2.13: signature images nudged up ~5pt
  // (~0.18cm) from their originally-measured baseline so the image sits
  // clear ABOVE the dotted signature line instead of overlapping it.
  employee_sig_img:  { left: 300, top: 492, width: 110, height: 15 },
  employee_name_paren: { left: 294, top: 518.5, width: 127.7 },

  stats_col: { used_before: 164, this_time: 211, total: 256 },
  stats_row: { sick: 647.4, personal: 668.05, annual: 688.65, other: 709.3 },

  hr_sig_img:      { left: 150, top: 738, width: 120, height: 15 },
  hr_name_paren:   { left: 124.9, top: 764, width: 106.1 },
  hr_position:     { left: 128, top: 784.5 },
  hr_day:          { left: 124, top: 804.5 },
  hr_month:        { left: 168, top: 804.5 },
  hr_year:         { left: 241, top: 804.5 },

  order_approve: { left: 387.7, top: 791.05 },
  order_reject:  { left: 466.7, top: 791.05 },

  boss_comment_line1: { left: 331, top: 598.5, width: 170 },
  boss_comment_line2: { left: 331, top: 616.1, width: 170 },
  // 2026-07-15 (round 3), item 1.3: re-measured against the scanned
  // background — the comment area's own dashed underline sits at ~625pt and
  // the "(ลงชื่อ)" dashed signature line sits at ~659.4pt (with the
  // "(ลงชื่อ)" label text itself occupying x:332-358pt, so the blank dash
  // portion runs roughly x:358-492pt). Previous box (top:646,height:15,
  // bottom:661) crossed straight through the 659.4pt line. Round 3 box
  // filled the space between the two dashed lines with a ~4.4pt gap above
  // the signature line. Round 4, item 1.1: still read as sitting too high
  // (too much whitespace under the signature ink before the line) — shifted
  // down another ~6pt (~0.2cm) per user request, so the box now sits right
  // at/just touching the line, matching how a real signature rests on it.
  boss_sig_img:       { left: 372, top: 634, width: 108, height: 27 },
  boss_name_paren:    { left: 364.2, top: 668.5, width: 122.4 },
  boss_position:      { left: 365, top: 703.5 },
  boss_day:           { left: 350, top: 721 },
  boss_month:         { left: 388, top: 721 },
  boss_year:          { left: 467, top: 721 },
}

function text(pos: { left: number; top: number; width?: number }, value: string, opts: { center?: boolean; size?: number } = {}) {
  if (!value) return ''
  const w = pos.width ? `width:${pos.width}pt;` : ''
  const align = opts.center ? 'text-align:center;' : ''
  const size = opts.size ?? 10.5
  return `<div class="fld" style="left:${pos.left}pt;top:${pos.top}pt;${w}${align}font-size:${size}pt;">${value}</div>`
}

// 2026-07-15: was '✕' (U+2715 MULTIPLICATION X, Dingbats block) — Sarabun
// (the only font loaded for this template) doesn't ship that glyph, so
// every checkbox mark rendered invisibly in production even though the
// underlying data (leave type, medical cert, approval status) was correct
// — confirmed by checking the DB directly for a case where the marks
// weren't showing: leave_type/status/etc were all correct. Plain 'X'
// (U+0058, Basic Latin) is guaranteed present in every font, Sarabun
// included, so this is a minimal, low-risk fix for all the "checkbox
// doesn't tick" reports (leave type, medical cert, คำสั่ง).
function mark(pos: { left: number; top: number }, show: boolean) {
  if (!show) return ''
  return `<div class="chk" style="left:${pos.left}pt;top:${pos.top}pt;">X</div>`
}

function cover(pos: { left: number; top: number; width: number; height: number }) {
  return `<div class="cover" style="left:${pos.left}pt;top:${pos.top}pt;width:${pos.width}pt;height:${pos.height}pt;"></div>`
}

function sigImg(pos: { left: number; top: number; width: number; height: number }, url?: string | null) {
  if (!url) return ''
  return `<img class="sigimg" src="${url}" style="left:${pos.left}pt;top:${pos.top}pt;width:${pos.width}pt;height:${pos.height}pt;" />`
}

export function generateLeaveOfficialFormHTML(data: LeaveOfficialFormData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`
  const bgSrc = `${appUrl}/forms/leave-form-bg.png`

  const written = dateParts(data.leave.created_at)
  const from    = dateParts(data.leave.start_date)
  const to      = dateParts(data.leave.end_date)
  const cbType  = LEAVE_TYPE_CHECKBOX[data.leave.leave_type] ?? 'other'

  const otherReasonText = data.leave.leave_type === 'maternity'
    ? `ลาคลอด${data.leave.reason ? ' — ' + data.leave.reason : ''}`
    : (cbType === 'other' ? (data.leave.reason ?? '') : '')

  // 2026-07-15, item 1.3: always show "อนุมัติ" here when the supervisor
  // has approved (data.approver is only populated on approval — see
  // official/route.ts), even if they didn't type a free-text comment.
  // Previously this area stayed blank whenever comment was empty, which
  // read as if the supervisor hadn't actually decided.
  const approverCommentFull = data.approver
    ? (data.approver.comment ? `อนุมัติ — ${data.approver.comment}` : 'อนุมัติ')
    : ''
  const commentLine1 = approverCommentFull.slice(0, 60)
  const commentLine2 = approverCommentFull.slice(60, 120)

  const employeeName = `${data.employee.first_name_th} ${data.employee.last_name_th}`
  const bossName = data.approver ? `${data.approver.first_name_th} ${data.approver.last_name_th}` : ''
  const hrName   = data.hrChecker ? `${data.hrChecker.first_name_th} ${data.hrChecker.last_name_th}` : ''

  const bossDate = dateParts(data.approver?.approved_at ?? null)
  const hrDate    = dateParts(data.hrChecker?.checked_at ?? null)

  const statFor = (t: 'sick' | 'personal' | 'annual' | 'other') =>
    data.balanceStats.find(s => s.leave_type === t)

  const fields: string[] = []

  fields.push(text(POS.place_written, data.leave.place_written ?? ''))
  fields.push(text(POS.written_day, written.day, { center: true }))
  fields.push(text(POS.written_month, written.month, { center: true }))
  fields.push(text(POS.written_year, written.year, { center: true }))
  // 2026-07-15, item 1.1 (round 2): white out the pre-printed "เรียน
  // ผู้จัดการฝ่าย ....." line entirely — avoids the confusing/redundant
  // read of a parsed department name sitting next to a pre-printed
  // "ผู้จัดการฝ่าย" label. Round 3 then re-added a dynamic "เรียน " prefix
  // (see below) since dropping it made the line read too abruptly.
  fields.push(cover(POS.dept_manager_cover))
  // 2026-07-15 (round 4), item 1.2: "เรียน" itself needs to render in black
  // (matching the pre-printed form's ink) while the live position title
  // after it keeps the usual blue used for all other filled-in fields — a
  // plain <span> override on just that word, nested inside the same .fld
  // div so it still inherits position/size from the `text()` helper.
  fields.push(text(POS.dept_manager, data.approver?.position_th
    ? `<span style="color:#000">เรียน</span> ${data.approver.position_th}`
    : ''))
  fields.push(text(POS.employee_name, employeeName))
  fields.push(text(POS.employee_position, data.employee.position_th ?? ''))

  fields.push(mark(POS.cb_sick, cbType === 'sick'))
  fields.push(mark(POS.cb_personal, cbType === 'personal'))
  fields.push(mark(POS.cb_annual, cbType === 'annual'))
  fields.push(mark(POS.cb_other, cbType === 'other'))
  if (cbType === 'sick') {
    // 2026-07-15 (round 3), item 1.2: previously only ticked "ไม่มี" when
    // the value was strictly `false` — leave requests created before this
    // field existed (or where it was never set) store `null`, so NEITHER
    // box ticked. Per user decision, treat "not explicitly มี" as "ไม่มี",
    // matching how the regular styled PDF already renders this same field
    // (see leave-template.ts: `medical_cert_provided ? 'มี' : 'ไม่มี'`).
    fields.push(mark(POS.cb_medcert_yes, data.leave.medical_cert_provided === true))
    fields.push(mark(POS.cb_medcert_no, data.leave.medical_cert_provided !== true))
  }
  // 2026-07-15 (round 4), item 1.3: the "เนื่องจาก...." blank was only ever
  // filled in for cbType === 'personal' — per repeated user feedback, it
  // should always show the leave's reason regardless of leave type (sick,
  // annual, etc. all have a reason too, not just กิจส่วนตัว).
  fields.push(text(POS.personal_reason, data.leave.reason ?? '', { size: 9.5 }))
  if (cbType === 'other') fields.push(text(POS.other_reason, otherReasonText, { size: 9.5 }))

  fields.push(text(POS.from_day, from.day, { center: true }))
  fields.push(text(POS.from_month, from.month, { center: true, size: 9.5 }))
  fields.push(text(POS.from_year, from.year, { center: true }))
  fields.push(text(POS.to_day, to.day, { center: true }))
  fields.push(text(POS.to_month, to.month, { center: true, size: 9.5 }))
  fields.push(text(POS.to_year, to.year, { center: true }))
  fields.push(text(POS.total_days, String(data.leave.total_days), { center: true }))

  // 2026-07-14 (part 2), items 2.5/2.6: pulled live from Profile, not typed
  // per leave request (see LeaveOfficialFormData.employee comment above).
  fields.push(text(POS.contact_address, data.employee.address ?? '', { size: 9.5 }))
  fields.push(text(POS.contact_phone, data.employee.phone ?? '', { size: 9.5 }))

  fields.push(sigImg(POS.employee_sig_img, data.signatures.employee_url))
  fields.push(text(POS.employee_name_paren, employeeName, { center: true }))

  // สถิติการลาในปีนี้
  for (const t of ['sick', 'personal', 'annual', 'other'] as const) {
    const s = statFor(t)
    if (!s) continue
    fields.push(text({ left: POS.stats_col.used_before, top: POS.stats_row[t] }, String(s.used_before), { center: true }))
    fields.push(text({ left: POS.stats_col.this_time,   top: POS.stats_row[t] }, s.this_time ? String(s.this_time) : '', { center: true }))
    fields.push(text({ left: POS.stats_col.total,       top: POS.stats_row[t] }, String(s.total), { center: true }))
  }

  // ผู้ตรวจสอบ (HR check)
  fields.push(sigImg(POS.hr_sig_img, data.signatures.hr_url))
  fields.push(text(POS.hr_name_paren, hrName, { center: true }))
  fields.push(text(POS.hr_position, data.hrChecker?.position_th ?? ''))
  fields.push(text(POS.hr_day, hrDate.day, { center: true }))
  fields.push(text(POS.hr_month, hrDate.month, { center: true, size: 9.5 }))
  fields.push(text(POS.hr_year, hrDate.year, { center: true }))

  // คำสั่ง (final order)
  fields.push(mark(POS.order_approve, data.leave.status === 'approved'))
  fields.push(mark(POS.order_reject, data.leave.status === 'rejected'))

  // ความเห็นของผู้บังคับบัญชา (supervisor)
  fields.push(text(POS.boss_comment_line1, commentLine1, { size: 9.5 }))
  fields.push(text(POS.boss_comment_line2, commentLine2, { size: 9.5 }))
  fields.push(sigImg(POS.boss_sig_img, data.signatures.approver_url))
  fields.push(text(POS.boss_name_paren, bossName, { center: true }))
  fields.push(text(POS.boss_position, data.approver?.position_th ?? ''))
  fields.push(text(POS.boss_day, bossDate.day, { center: true }))
  fields.push(text(POS.boss_month, bossDate.month, { center: true, size: 9.5 }))
  fields.push(text(POS.boss_year, bossDate.year, { center: true }))

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบลา (แบบฟอร์มทางการ) - ${employeeName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 595.32pt; height: 841.92pt; }
  body { font-family: 'Sarabun', sans-serif; position: relative; }
  .page {
    position: relative;
    width: 595.32pt;
    height: 841.92pt;
    background-image: url('${bgSrc}');
    background-size: 100% 100%;
    background-repeat: no-repeat;
  }
  .logo { position: absolute; object-fit: contain; }
  .fld {
    position: absolute;
    color: #1a1a8c;
    white-space: nowrap;
    line-height: 1.1;
  }
  .chk {
    position: absolute;
    font-size: 11pt;
    font-weight: 700;
    color: #1a1a8c;
    line-height: 1;
    transform: translate(-50%, -50%);
  }
  .sigimg { position: absolute; object-fit: contain; }
  /* 2026-07-15: plain white patch to blot out a pre-printed line on the
     scanned background (sampled as pure #fff, so this blends in). */
  .cover { position: absolute; background: #fff; }
</style>
</head>
<body>
  <div class="page">
    <img class="logo" src="${logoSrc}" style="left:${POS.logo.left}pt;top:${POS.logo.top}pt;width:${POS.logo.width}pt;" onerror="this.style.display='none'" />
    ${fields.join('\n    ')}
  </div>
</body>
</html>`
}
