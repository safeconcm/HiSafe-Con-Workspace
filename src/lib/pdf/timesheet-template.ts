// src/lib/pdf/timesheet-template.ts
// HTML template for Monthly Timesheet PDF
//
// Redesigned as a matrix (per user request): jobs run down the left
// (vertical axis), dates run across the top (horizontal axis) — the
// standard construction-site timesheet layout, and compact enough to fit
// on a single A4 page instead of the previous one-row-per-day list, which
// ran to multiple pages for a full month.

import { letterheadName, letterheadMetaHTML } from './company-letterhead'

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const TH_DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส']

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

export interface TimesheetTemplateData {
  company: {
    code: string; name_th: string; name_en: string
    // Full letterhead fields (companies.legal_name_th/address_th/tax_id/
    // phone/contact_email) — optional/nullable so nothing breaks for a
    // company row that hasn't had these filled in yet. See conversation
    // 2026-07-11 ("ที่ต้องใส่ในหัวกระดาษเอกสารต่าง ทุกเอกสาร").
    legal_name_th?: string | null
    address_th?: string | null
    tax_id?: string | null
    phone?: string | null
    contact_email?: string | null
  }
  employee: {
    employee_code: string; first_name_th: string; last_name_th: string
    position_th: string | null; department: string | null
  }
  timesheet: {
    id: string; year: number; month: number; status: string
    total_hours: number; approved_at: string | null
  }
  lines: {
    work_date: string; hours: number; line_type: string
    job?: { job_code: string; name_th: string } | null
    remark?: string | null
  }[]
  approver?: { first_name_th: string; last_name_th: string } | null
  holidays: { holiday_date: string; name_th: string }[]
  // day-of-month (1..31) -> is this a working day per the company's work
  // schedule (src/lib/work-schedule.ts)? Replaces the old hardcoded
  // "Sat/Sun = weekend for everyone" assumption — Highcon works Saturdays,
  // Safecon may have specific worked Saturdays via HR-set overrides.
  workingDayMap: Map<number, boolean>
}

export function generateTimesheetHTML(data: TimesheetTemplateData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`

  const monthName = TH_MONTHS[data.timesheet.month - 1]
  const thaiYear  = data.timesheet.year + 543

  const holidayMap = new Map<string, string>()
  data.holidays.forEach(h => holidayMap.set(h.holiday_date, h.name_th))

  // All calendar days in the month — these become the column headers.
  const daysInMonth: Date[] = []
  const start = new Date(data.timesheet.year, data.timesheet.month - 1, 1)
  const end   = new Date(data.timesheet.year, data.timesheet.month, 0)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    daysInMonth.push(new Date(d))
  }

  const workLines  = data.lines.filter(l => l.line_type === 'work')
  const leaveLines = data.lines.filter(l => l.line_type === 'leave')

  // Row per job: job code/name -> (day-of-month -> hours) + running total.
  const jobRows = new Map<string, { code: string; name: string; hoursByDay: Map<number, number>; total: number }>()
  workLines.forEach(l => {
    if (!l.job) return
    const key = l.job.job_code
    const row = jobRows.get(key) ?? { code: l.job.job_code, name: l.job.name_th, hoursByDay: new Map(), total: 0 }
    const day = new Date(l.work_date).getDate()
    row.hoursByDay.set(day, (row.hoursByDay.get(day) ?? 0) + l.hours)
    row.total += l.hours
    jobRows.set(key, row)
  })

  // Leave row: day-of-month -> hours taken as leave.
  const leaveByDay = new Map<number, number>()
  let leaveTotal = 0
  leaveLines.forEach(l => {
    const day = new Date(l.work_date).getDate()
    leaveByDay.set(day, (leaveByDay.get(day) ?? 0) + l.hours)
    leaveTotal += l.hours
  })

  // Column totals (all jobs + leave, per day) for the footer row.
  const dayTotals = new Map<number, number>()
  jobRows.forEach(row => row.hoursByDay.forEach((h, day) => dayTotals.set(day, (dayTotals.get(day) ?? 0) + h)))
  leaveByDay.forEach((h, day) => dayTotals.set(day, (dayTotals.get(day) ?? 0) + h))

  const sortedJobs = Array.from(jobRows.values()).sort((a, b) => a.code.localeCompare(b.code))

  const dayHeaderCells = daysInMonth.map(day => {
    const dow = day.getDay()
    const isWeekend = data.workingDayMap.get(day.getDate()) === false
    const dateStr = day.toISOString().split('T')[0]
    const isHoliday = holidayMap.has(dateStr)
    const cls = isHoliday ? 'col-holiday' : isWeekend ? 'col-weekend' : ''
    return `<th class="day-col ${cls}"><div class="dow">${TH_DAYS[dow]}</div><div class="dnum">${day.getDate()}</div></th>`
  }).join('')

  const jobRowsHtml = sortedJobs.map(row => {
    const cells = daysInMonth.map(day => {
      const isWeekend = data.workingDayMap.get(day.getDate()) === false
      const dateStr = day.toISOString().split('T')[0]
      const isHoliday = holidayMap.has(dateStr)
      const cls = isHoliday ? 'col-holiday' : isWeekend ? 'col-weekend' : ''
      const h = row.hoursByDay.get(day.getDate())
      return `<td class="day-col ${cls}">${h ? h : ''}</td>`
    }).join('')
    return `<tr>
      <td class="job-col"><span class="job-code">${row.code}</span><span class="job-name">${row.name}</span></td>
      ${cells}
      <td class="total-col">${row.total}</td>
    </tr>`
  }).join('')

  const leaveRowHtml = leaveLines.length > 0 ? `<tr class="leave-row">
    <td class="job-col"><span class="job-name">ลา</span></td>
    ${daysInMonth.map(day => {
      const isWeekend = data.workingDayMap.get(day.getDate()) === false
      const dateStr = day.toISOString().split('T')[0]
      const isHoliday = holidayMap.has(dateStr)
      const cls = isHoliday ? 'col-holiday' : isWeekend ? 'col-weekend' : ''
      const h = leaveByDay.get(day.getDate())
      return `<td class="day-col ${cls}">${h ? h : ''}</td>`
    }).join('')}
    <td class="total-col">${leaveTotal}</td>
  </tr>` : ''

  const totalRowHtml = `<tr class="total-row">
    <td class="job-col">รวมชั่วโมง/วัน</td>
    ${daysInMonth.map(day => {
      const isWeekend = data.workingDayMap.get(day.getDate()) === false
      const dateStr = day.toISOString().split('T')[0]
      const isHoliday = holidayMap.has(dateStr)
      const cls = isHoliday ? 'col-holiday' : isWeekend ? 'col-weekend' : ''
      const h = dayTotals.get(day.getDate())
      return `<td class="day-col ${cls}">${h ? h : ''}</td>`
    }).join('')}
    <td class="total-col">${data.timesheet.total_hours}</td>
  </tr>`

  const holidayFootnotes = data.holidays
    .filter(h => h.holiday_date >= start.toISOString().split('T')[0] && h.holiday_date <= end.toISOString().split('T')[0])
    .map(h => `${new Date(h.holiday_date).getDate()} ${h.name_th}`)

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>Timesheet - ${data.employee.first_name_th} ${TH_MONTHS[data.timesheet.month-1]} ${thaiYear}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { width: 210mm; height: 297mm; padding: 10mm; margin: 0 auto; background: #fff; overflow: hidden; }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 8px;
  }
  .header-logo { height: 38px; object-fit: contain; }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 { font-size: 15px; font-weight: 700; color: #1e3a8a; }
  .header-center p { font-size: 10px; color: #555; }
  .header-center .meta { font-size: 8px; color: #777; margin-top: 1px; }
  .doc-id { font-size: 9px; color: #888; text-align: right; min-width: 120px; }
  .doc-title {
    text-align: center; font-size: 14px; font-weight: 700; color: #1e3a8a;
    margin-bottom: 8px; padding: 5px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .info-bar {
    display: flex; flex-wrap: wrap; gap: 4px 20px; align-items: baseline;
    margin-bottom: 10px; padding: 7px 12px; background: #f8fafc;
    border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px;
  }
  .info-bar b { color: #111; font-weight: 600; }
  .status-badge {
    display: inline-block; padding: 1px 8px; border-radius: 9px;
    font-size: 10px; font-weight: 600;
  }
  .status-approved { background: #dcfce7; color: #16a34a; }
  .status-submitted { background: #fef3c7; color: #d97706; }
  .status-draft { background: #f3f4f6; color: #6b7280; }
  /* Matrix table: jobs down the left, dates across the top */
  .matrix { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 6px; }
  .matrix th, .matrix td { border: 0.5px solid #d1d5db; text-align: center; }
  .job-col { width: 30mm; text-align: left; padding: 2px 4px; font-size: 8px; }
  .job-col .job-code { font-family: monospace; color: #1e3a8a; font-weight: 700; display: block; }
  .job-col .job-name { color: #444; display: block; }
  .day-col { width: 4.4mm; font-size: 7px; padding: 1px 0; }
  .total-col { width: 11mm; font-size: 8px; font-weight: 700; color: #1e3a8a; }
  thead .day-col { background: #1e3a8a; color: #fff; padding: 2px 0; }
  thead .day-col .dow { font-size: 5.5px; opacity: .8; }
  thead .day-col .dnum { font-size: 7.5px; font-weight: 700; }
  thead .total-col { background: #1e3a8a; color: #fff; font-size: 7px; }
  thead .job-col { background: #1e3a8a; color: #fff; font-size: 8px; }
  .col-weekend { background: #f3f4f6; color: #9ca3af; }
  .col-holiday { background: #fef2f2; color: #dc2626; }
  thead .col-weekend { background: #33448a; }
  thead .col-holiday { background: #7a2020; }
  .leave-row td { background: #f0fdf4; color: #16a34a; font-weight: 600; }
  .leave-row .job-col .job-name { color: #16a34a; font-weight: 700; }
  .total-row td { background: #eff6ff; font-weight: 700; border-top: 1.5px solid #1e3a8a; }
  .holiday-note { font-size: 8px; color: #888; margin-bottom: 8px; }
  /* Summary strip */
  .summary-strip { display: flex; gap: 10px; margin-bottom: 10px; }
  .summary-chip {
    flex: 1; text-align: center; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 4px;
  }
  .summary-chip .v { font-size: 16px; font-weight: 700; color: #1e3a8a; }
  .summary-chip .l { font-size: 9px; color: #888; }
  /* Signature */
  .sig-section {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 16px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #e5e7eb;
  }
  .sig-box { text-align: center; }
  .sig-line { border-bottom: 1px solid #aaa; height: 28px; margin: 0 12px 4px; }
  .sig-label { font-size: 9px; color: #666; }
  .sig-name { font-size: 10px; font-weight: 600; margin-top: 2px; }
  .sig-date { font-size: 8px; color: #888; margin-top: 2px; }
  .footer {
    margin-top: 10px; padding-top: 6px; border-top: 1px solid #e5e7eb;
    font-size: 8px; color: #aaa; display: flex; justify-content: space-between;
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <img src="${logoSrc}" alt="${data.company.name_th}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-center">
      <h1>${letterheadName(data.company)}</h1>
      ${letterheadMetaHTML(data.company)}
    </div>
    <div class="doc-id">
      <div>เลขที่: TS-${data.timesheet.id.slice(-8).toUpperCase()}</div>
      <div style="margin-top:2px">พิมพ์: ${new Date().toLocaleDateString('th-TH')}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">Timesheet รายเดือน — ${monthName} ${thaiYear}</div>

  <!-- Employee Info -->
  <div class="info-bar">
    <span>รหัสพนักงาน: <b>${data.employee.employee_code}</b></span>
    <span>ชื่อ-นามสกุล: <b>${data.employee.first_name_th} ${data.employee.last_name_th}</b></span>
    <span>ตำแหน่ง: <b>${data.employee.position_th ?? '—'}</b></span>
    <span>แผนก: <b>${data.employee.department ?? '—'}</b></span>
    <span class="status-badge status-${data.timesheet.status}">
      ${data.timesheet.status === 'approved' ? 'อนุมัติแล้ว'
        : data.timesheet.status === 'submitted' ? 'รออนุมัติ' : 'ร่าง'}
    </span>
  </div>

  <!-- Summary strip -->
  <div class="summary-strip">
    <div class="summary-chip"><div class="v">${data.timesheet.total_hours}</div><div class="l">ชั่วโมงงานรวม</div></div>
    <div class="summary-chip"><div class="v">${sortedJobs.length}</div><div class="l">จำนวนงาน (Job)</div></div>
    <div class="summary-chip"><div class="v">${leaveTotal}</div><div class="l">ชั่วโมงลา</div></div>
  </div>

  <!-- Matrix: jobs (rows) x dates (columns) -->
  <table class="matrix">
    <thead>
      <tr>
        <th class="job-col">Job</th>
        ${dayHeaderCells}
        <th class="total-col">รวม</th>
      </tr>
    </thead>
    <tbody>
      ${jobRowsHtml || '<tr><td class="job-col" colspan="1">—</td></tr>'}
      ${leaveRowHtml}
      ${totalRowHtml}
    </tbody>
  </table>

  ${holidayFootnotes.length > 0 ? `<div class="holiday-note">วันหยุด: ${holidayFootnotes.join(' · ')}</div>` : ''}

  <!-- Signatures -->
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">ลงชื่อพนักงาน</div>
      <div class="sig-name">${data.employee.first_name_th} ${data.employee.last_name_th}</div>
      <div class="sig-date">&nbsp;</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">ลงชื่อผู้อนุมัติ</div>
      <div class="sig-name">${data.approver
        ? `${data.approver.first_name_th} ${data.approver.last_name_th}`
        : '...........................'}</div>
      <div class="sig-date">${data.timesheet.approved_at
        ? `วันที่ ${formatThaiDate(data.timesheet.approved_at)}`
        : '&nbsp;'}</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">ลงชื่อ HR รับทราบ</div>
      <div class="sig-name">...</div>
      <div class="sig-date">&nbsp;</div>
    </div>
  </div>

  <div class="footer">
    <span>CONNEX · ${data.company.name_th}</span>
    <span>เอกสารอัตโนมัติ · TS-${data.timesheet.id.slice(-8).toUpperCase()}</span>
  </div>
</div>
</body>
</html>`
}
