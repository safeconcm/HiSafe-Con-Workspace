// src/lib/pdf/timesheet-official-form-template.ts
// "พิมพ์แบบฟอร์มทางการ" for Timesheet — replicates the company's real shared
// paper form ("Staff Monthly Attendance Time Allocation Rechord", used by
// both SAFECON/HIGHCON) as a fresh HTML/CSS build on Landscape A4. Unlike
// the leave official-form (which overlays text on a scanned background PNG
// at measured pixel coordinates), no scanned background exists for this
// form, so this is a from-scratch reconstruction — text, legend wording and
// the Activity Code list are transcribed verbatim from the source PDF
// (including its own typos: "Bussiness", "Planing", "Rechord", "Absense",
// "No.of") so the printed output matches the source 100%, per explicit user
// request. Reference files examined (not committed): Staff-Timesheet-SC
// Udomchai.pdf/.xlsx (blank template) and EXAMPLE-March 2026-Staff-
// Timesheet.pdf (filled real example) — both uploaded 2026-07-16.
//
// Data entry stays in the existing system (TimesheetGrid); this is a
// read-only export layer, additive alongside the existing styled PDF
// (timesheet-template.ts) — neither replaces the other.
//
// ── Section A (absence code) derivation ─────────────────────────────────
// The source form's H/V/S/F/T/I/X/M single-letter codes have no equivalent
// column in the system's schema. Rather than expanding the schema, each
// day's code is derived at render time from data that already exists:
//   H  company holiday (holidays table)                    — always wins
//   (Sunday: shaded, no letter — not in the form's own legend)
//   F  Saturday the company schedule marks non-working (work-schedule.ts)
//   V  approved leave_type='annual'
//   S  approved leave_type='sick'
//   T  approved leave_type='other', other_subtype='training'
//   I  approved leave_type='other', other_subtype='injury'
//   M  approved leave_type='other', other_subtype='authorized' — also the
//      fallback for 'personal' (ลากิจ) and 'maternity' (ลาคลอด), neither of
//      which has a dedicated letter on this English-language form; M's own
//      legend ("Other authorized leave") is the closest fit. Flagged to the
//      user as an assumption, adjustable later if HR wants a different
//      mapping.
//   X  user.resign_date is set and this date falls on/after it
// A day is "shaded" (locked, Section B shows blank not "-") for H/Sunday/F/X
// and full-day leave; a half-day leave still gets its letter but stays
// unshaded, since the person did work part of that day.

import { letterheadName } from './company-letterhead'

const EN_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Verbatim from the source form's own legend (Section B), incl. its typos.
const ACTIVITY_CODE_LABELS: Record<string, string> = {
  '01': 'Pre-tendering/Tendering',
  '02': 'Design/Engineering',
  '03': 'Bussiness Development',
  '04': 'Project/Site Supervision',
  '05': 'Project/Site Administration',
  '06': 'Project/Site Management',
  '07': 'Project/Site Support and Planing',
  '08': 'Plant',
  '09': 'Safety',
  '10': 'General Administration Work',
  '11': 'Other Work',
}

type AbsenceCode = 'H' | 'V' | 'S' | 'F' | 'T' | 'I' | 'X' | 'M'

export interface TimesheetOfficialFormData {
  company: { code: string; name_th: string; name_en?: string | null; legal_name_th?: string | null }
  employee: {
    first_name_en: string | null; last_name_en: string | null
    first_name_th: string; last_name_th: string
    position_en: string | null; position_th: string | null
    nickname: string | null
    based: 'office' | 'field' | null
    resign_date: string | null
  }
  timesheet: { id: string; year: number; month: number; approved_at: string | null }
  lines: {
    work_date: string; hours: number; line_type: string
    job?: { job_code: string; name_th: string; name_en?: string | null } | null
    activity_code?: string | null
  }[]
  holidays: { holiday_date: string; name_th: string }[]
  leaves: {
    leave_type: string
    other_subtype: string | null
    start_date: string; end_date: string
    is_half_day: boolean
  }[]
  workingDayMap: Map<number, boolean>
  signatures: { employee_url: string | null; approver_url: string | null }
}

function fmt(n: number): string {
  // Hours -> "day fraction" (8h -> 1, 4h -> 0.5), trimmed of trailing zeros
  // beyond one decimal, matching the source example's "1.0" / "-" style.
  const v = n / 8
  return (Math.round(v * 100) / 100).toFixed(v % 1 === 0 ? 1 : 2)
}

export function generateTimesheetOfficialFormHTML(data: TimesheetOfficialFormData, appUrl: string): string {
  const { year, month } = data.timesheet
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthPad = String(month).padStart(2, '0')

  const holidayMap = new Map<string, string>()
  data.holidays.forEach(h => holidayMap.set(h.holiday_date, h.name_th))

  const dateStrOf = (day: number) => `${year}-${monthPad}-${String(day).padStart(2, '0')}`

  // Approved leave, expanded to a per-date map (start..end inclusive).
  const leaveByDate = new Map<string, { leave_type: string; other_subtype: string | null; is_half_day: boolean }>()
  for (const lv of data.leaves) {
    const start = new Date(lv.start_date)
    const end   = new Date(lv.end_date)
    for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, '0'), d = String(cur.getDate()).padStart(2, '0')
      leaveByDate.set(`${y}-${m}-${d}`, { leave_type: lv.leave_type, other_subtype: lv.other_subtype, is_half_day: lv.is_half_day })
    }
  }

  const resignDate = data.employee.resign_date

  // ── Per-day derivation (Section A) ──────────────────────────────────
  const dayInfo = days.map(day => {
    const dateStr = dateStrOf(day)
    const dow = new Date(year, month - 1, day).getDay() // 0=Sun 6=Sat
    let code: AbsenceCode | null = null
    let shaded = false

    if (holidayMap.has(dateStr)) {
      code = 'H'; shaded = true
    } else if (dow === 0) {
      shaded = true // Sunday — structurally non-working, no letter on this form
    } else if (dow === 6 && data.workingDayMap.get(day) === false) {
      code = 'F'; shaded = true
    } else {
      const lv = leaveByDate.get(dateStr)
      if (lv) {
        if (lv.leave_type === 'annual') code = 'V'
        else if (lv.leave_type === 'sick') code = 'S'
        else if (lv.leave_type === 'other' && lv.other_subtype === 'training') code = 'T'
        else if (lv.leave_type === 'other' && lv.other_subtype === 'injury') code = 'I'
        else code = 'M' // other/authorized + personal + maternity fallback (see file header)
        shaded = !lv.is_half_day
      } else if (resignDate && dateStr >= resignDate) {
        code = 'X'; shaded = true
      }
    }
    return { day, dateStr, dow, code, shaded }
  })

  const codeCounts: Record<Exclude<AbsenceCode, 'X'>, number> = { H: 0, V: 0, S: 0, F: 0, T: 0, I: 0, M: 0 }
  dayInfo.forEach(d => { if (d.code && d.code !== 'X') codeCounts[d.code]++ })

  // ── Section B: job rows ─────────────────────────────────────────────
  const workLines = data.lines.filter(l => l.line_type === 'work')
  const jobRows = new Map<string, {
    code: string; name: string; activityCode: string | null
    hoursByDay: Map<number, number>; total: number
  }>()
  workLines.forEach(l => {
    if (!l.job) return
    const key = l.job.job_code
    const row = jobRows.get(key) ?? {
      code: l.job.job_code, name: l.job.name_en || l.job.name_th,
      activityCode: null, hoursByDay: new Map(), total: 0,
    }
    const day = new Date(l.work_date).getDate()
    row.hoursByDay.set(day, (row.hoursByDay.get(day) ?? 0) + l.hours)
    row.total += l.hours
    if (!row.activityCode && l.activity_code) row.activityCode = l.activity_code
    jobRows.set(key, row)
  })
  const sortedJobs = Array.from(jobRows.values()).sort((a, b) => a.code.localeCompare(b.code))
  const grandTotal = sortedJobs.reduce((s, r) => s + r.total, 0)

  // Row cap confirmed with user 2026-07-16 ("28 แถวพอ") — pad with blank
  // rows so the printed grid keeps the source form's fixed height/look
  // regardless of how many jobs were actually logged.
  const ROW_CAP = 28
  const blankRowsNeeded = Math.max(0, ROW_CAP - sortedJobs.length)

  // ── HTML builders ────────────────────────────────────────────────────
  const secADayHeader = days.map(d => `<th class="day">${d}</th>`).join('')
  const secASumHeader = (['H','V','S','F','T','I','M'] as const).map(c => `<th class="sum">${c}</th>`).join('')
  const secAMarkRow = dayInfo.map(d => `<td class="day${d.shaded ? ' shaded' : ''}">${d.code ?? ''}</td>`).join('')
  const secASumRow = (['H','V','S','F','T','I','M'] as const).map(c => `<td class="sum">${codeCounts[c] || ''}</td>`).join('')

  const secBDayHeader = days.map(d => `<th class="day">${d}</th>`).join('')

  const jobRowHtml = (row: typeof sortedJobs[number] | null) => {
    const cells = dayInfo.map(d => {
      if (!row) return `<td class="day${d.shaded ? ' shaded' : ''}"></td>`
      if (d.shaded) return `<td class="day shaded"></td>`
      const h = row.hoursByDay.get(d.day)
      if (h && h > 0) return `<td class="day">${fmt(h)}</td>`
      if (d.code) return `<td class="day">-</td>` // weekday absence, no hours this job
      return `<td class="day"></td>`
    }).join('')
    return `<tr>
      <td class="alloc-code">${row?.code ?? ''}</td>
      <td class="alloc-desc">${row?.name ?? ''}</td>
      <td class="activity-code">${row?.activityCode ?? ''}</td>
      ${cells}
      <td class="total-days">${row && row.total > 0 ? fmt(row.total) : ''}</td>
    </tr>`
  }

  const jobRowsHtml = sortedJobs.map(r => jobRowHtml(r)).join('')
  const blankRowsHtml = Array.from({ length: blankRowsNeeded }, () => jobRowHtml(null)).join('')

  const employeeName = (data.employee.first_name_en && data.employee.last_name_en)
    ? `${data.employee.first_name_en} ${data.employee.last_name_en}`
    : `${data.employee.first_name_th} ${data.employee.last_name_th}`
  const position = data.employee.position_en || data.employee.position_th || ''
  const basedLabel = data.employee.based === 'office' ? 'Office' : data.employee.based === 'field' ? 'Field' : ''

  const approvedDate = data.timesheet.approved_at
    ? new Date(data.timesheet.approved_at).toLocaleDateString('en-GB')
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Timesheet Official Form - ${employeeName} ${EN_MONTHS[month - 1]} ${year}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Sarabun', sans-serif; font-size: 8.5px; line-height: 1.15; color: #000; background: #fff; }
  /* 2026-07-21, item 1: page height is no longer forced to a literal 210mm
     box — that was purely a sizing reference and didn't actually control
     pagination (the real page size comes from render.ts's puppeteer
     `format:'A4', landscape:true`), but it invited stacking content past
     the real printable area without any visual warning. Trimmed padding
     (8mm -> 6mm top/bottom) and every fixed row-height below so the whole
     form actually fits the ~198mm usable height on one page — see the
     per-section height budget in this file's comments. */
  .page { width: 297mm; padding: 6mm 8mm; background: #fff; }
  h1.title { font-size: 12px; font-weight: 700; margin-bottom: 3px; }

  table { border-collapse: collapse; table-layout: fixed; }
  td, th { border: 0.5px solid #000; }

  /* 2026-07-21, item 2: Name/Position/Based/Month row — was a <table
     table-layout:fixed> with label cells at `width:1%`, intending them to
     shrink to their text ("Name:", "Position:" ...). That trick only works
     under table-layout:auto; under `fixed` the browser takes 1% literally
     (a couple px), so the label text overflowed its cell and visually
     collided with the value text next to it. Switched to a flex row —
     labels are `white-space:nowrap` and size to their own content
     naturally, values that could run long (name/position) get an explicit
     max-width + ellipsis instead of overlapping their neighbor. */
  .info-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: nowrap; white-space: nowrap; padding: 2px 5px; font-size: 9.5px; border-bottom: 1px solid #000; margin-bottom: 2px; }
  .info-row .lbl { white-space: nowrap; }
  .info-row .val { font-weight: 700; font-style: italic; color: #7a1010; overflow: hidden; text-overflow: ellipsis; }
  .info-row .val-blue { font-weight: 700; color: #1e3a8a; white-space: nowrap; }
  .info-row .name-val { max-width: 70mm; }
  .info-row .pos-val { max-width: 45mm; }

  .section-title { font-size: 10px; font-weight: 700; font-style: italic; padding: 2px 4px; border: 1px solid #000; border-top: none; }

  /* Legend (4 cols x 2 rows) */
  .legend-table { width: 100%; }
  .legend-table td { padding: 1px 6px; border: none; font-size: 8.5px; white-space: nowrap; }
  .legend-table .legend-lbl { width: 14%; }

  /* Section A grid */
  .secA-wrap { display: flex; border: 1px solid #000; border-top: none; }
  .secA-note { width: 44mm; padding: 2px 4px; font-size: 8.5px; border-right: 1px solid #000; display: flex; align-items: center; }
  .secA-table { flex: 1; }
  .secA-table th, .secA-table td { text-align: center; font-size: 7px; }
  .secA-table th.day, .secA-table td.day { width: 6mm; }
  .secA-table th.sum, .secA-table td.sum { width: 6mm; font-weight: 700; }
  .secA-table td.shaded { background: repeating-linear-gradient(45deg, #eee, #eee 2px, #fff 2px, #fff 4px); }
  .secA-table td { height: 4.2mm; font-weight: 700; }

  /* Section B legend (activity codes, 4 cols x 3 rows) */
  .actlegend-table { width: 100%; border: 1px solid #000; border-top: none; }
  .actlegend-table td { padding: 1px 6px; border: none; font-size: 8.5px; white-space: nowrap; }

  /* Section B grid — row height is the single biggest lever on total page
     height (28 rows + 1 total row, confirmed row cap). Kept at 4.0mm
     (down from 4.6mm) purely to fit one page; ~7mm of visual row height is
     lost overall, no data/columns removed. */
  .secB-table { width: 100%; border: 1px solid #000; border-top: none; }
  .secB-table th, .secB-table td { text-align: center; font-size: 7px; }
  .secB-table th.alloc-code, .secB-table td.alloc-code { width: 14mm; font-weight: 700; }
  .secB-table th.alloc-desc, .secB-table td.alloc-desc { width: 50mm; text-align: left; padding-left: 3px; }
  .secB-table th.activity-code, .secB-table td.activity-code { width: 12mm; color: #1e3a8a; font-weight: 700; }
  .secB-table th.day, .secB-table td.day { width: 6mm; }
  .secB-table th.total-days, .secB-table td.total-days { width: 16mm; font-weight: 700; }
  .secB-table td { height: 4mm; }
  .secB-table td.shaded { background: repeating-linear-gradient(45deg, #eee, #eee 2px, #fff 2px, #fff 4px); }
  .secB-table thead th { padding: 2px 0; font-weight: 700; }
  .secB-table .total-row td { font-weight: 700; }
  .secB-table .total-row .total-days { color: #b91c1c; }

  /* Signatures */
  .sig-row { display: flex; justify-content: space-around; margin-top: 5mm; font-size: 9.5px; }
  .sig-row .sig-img { display: block; height: 10mm; object-fit: contain; margin: 0 auto 2px; }
  .sig-row .sig-line { display: inline-block; border-bottom: 1px solid #000; width: 55mm; }

  .footer { margin-top: 2mm; font-size: 7px; color: #999; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">

  <h1 class="title">Staff Monthly Attendance Time Allocation Rechord</h1>

  <div class="info-row">
    <span class="lbl">Name:</span>
    <span class="val name-val" title="${employeeName}">${employeeName}</span>
    <span class="val-blue">${data.employee.nickname ?? ''}</span>
    <span class="lbl">Position:</span>
    <span class="val pos-val" title="${position}">${position}</span>
    <span class="lbl">Based:</span>
    <span class="val-blue">${basedLabel}</span>
    <span class="lbl">Month:</span>
    <span class="val-blue">${EN_MONTHS[month - 1]}</span>
    <span class="val-blue">${year}</span>
  </div>

  <div class="section-title">Section A : Work Absence</div>
  <table class="legend-table">
    <tr>
      <td class="legend-lbl">Reason for Absense:</td>
      <td>H - Holiday</td><td>S - Sick leave</td><td>T - Training Course or Seminar</td><td>X - Not employed by the Organization</td>
    </tr>
    <tr>
      <td></td>
      <td>V - Vacation leave</td><td>F - Free Saturday</td><td>I - Work injury leave</td><td>M - Other authorized leave such as Examination</td>
    </tr>
  </table>
  <div class="secA-wrap">
    <div class="secA-note">When not working, mark the above stated reason for absence</div>
    <table class="secA-table">
      <thead><tr>${secADayHeader}${secASumHeader}</tr></thead>
      <tbody><tr>${secAMarkRow}${secASumRow}</tr></tbody>
    </table>
  </div>

  <div class="section-title">Section B : Time Allocation of Work on Project Tenders or for Other Cost Centers</div>
  <table class="actlegend-table">
    <tr>
      <td style="width:25%">01 - ${ACTIVITY_CODE_LABELS['01']}</td>
      <td style="width:25%">04 - ${ACTIVITY_CODE_LABELS['04']}</td>
      <td style="width:25%">07 - ${ACTIVITY_CODE_LABELS['07']}</td>
      <td>10 - ${ACTIVITY_CODE_LABELS['10']}</td>
    </tr>
    <tr>
      <td>02 - ${ACTIVITY_CODE_LABELS['02']}</td>
      <td>05 - ${ACTIVITY_CODE_LABELS['05']}</td>
      <td>08 - ${ACTIVITY_CODE_LABELS['08']}</td>
      <td>11 - ${ACTIVITY_CODE_LABELS['11']}</td>
    </tr>
    <tr>
      <td>03 - ${ACTIVITY_CODE_LABELS['03']}</td>
      <td>06 - ${ACTIVITY_CODE_LABELS['06']}</td>
      <td>09 - ${ACTIVITY_CODE_LABELS['09']}</td>
      <td></td>
    </tr>
  </table>
  <table class="secB-table">
    <thead>
      <tr>
        <th class="alloc-code" rowspan="2">Allocation<br/>Code</th>
        <th class="alloc-desc" rowspan="2">Allocation Description</th>
        <th class="activity-code" rowspan="2">Activity<br/>Code</th>
        ${secBDayHeader}
        <th class="total-days" rowspan="2">Total No.of<br/>Working Days</th>
      </tr>
    </thead>
    <tbody>
      ${jobRowsHtml}
      ${blankRowsHtml}
      <tr class="total-row">
        <td class="alloc-code">-</td>
        <td class="alloc-desc" style="text-align:center">Total</td>
        <td class="activity-code">-</td>
        ${days.map(() => `<td class="day"></td>`).join('')}
        <td class="total-days">${fmt(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="sig-row">
    <div>
      Staff 's Signature:
      ${data.signatures.employee_url
        ? `<img src="${data.signatures.employee_url}" class="sig-img" style="display:inline-block;height:8mm;vertical-align:middle" />`
        : `<span class="sig-line"></span>`}
    </div>
    <div>
      Authorized by:
      ${data.signatures.approver_url
        ? `<img src="${data.signatures.approver_url}" class="sig-img" style="display:inline-block;height:8mm;vertical-align:middle" />`
        : `<span class="sig-line"></span>`}
    </div>
    <div>Date: ${approvedDate || '<span class="sig-line" style="width:35mm"></span>'}</div>
  </div>

  <div class="footer">
    <span>CONNEX · ${letterheadName({ name_th: data.company.name_th, name_en: data.company.name_en, legal_name_th: data.company.legal_name_th })}</span>
    <span>เอกสารอัตโนมัติ · TS-${data.timesheet.id.slice(-8).toUpperCase()}</span>
  </div>
</div>
</body>
</html>`
}
