// src/lib/pdf/timesheet-template.ts
// HTML template for Monthly Timesheet PDF

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const TH_DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส']

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

export interface TimesheetTemplateData {
  company: { code: string; name_th: string; name_en: string }
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
}

export function generateTimesheetHTML(data: TimesheetTemplateData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`

  const monthName = TH_MONTHS[data.timesheet.month - 1]
  const thaiYear  = data.timesheet.year + 543

  // Build a map of date → line
  const lineMap = new Map<string, typeof data.lines[0]>()
  data.lines.forEach(l => lineMap.set(l.work_date, l))
  const holidayMap = new Map<string, string>()
  data.holidays.forEach(h => holidayMap.set(h.holiday_date, h.name_th))

  // Generate all days in month
  const daysInMonth: Date[] = []
  const start = new Date(data.timesheet.year, data.timesheet.month - 1, 1)
  const end   = new Date(data.timesheet.year, data.timesheet.month, 0)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    daysInMonth.push(new Date(d))
  }

  const workLines  = data.lines.filter(l => l.line_type === 'work')
  const leaveLines = data.lines.filter(l => l.line_type === 'leave')

  // Group work hours by job
  const jobSummary = new Map<string, { code: string; name: string; hours: number }>()
  workLines.forEach(l => {
    if (!l.job) return
    const key = l.job.job_code
    const cur = jobSummary.get(key) ?? { code: l.job.job_code, name: l.job.name_th, hours: 0 }
    cur.hours += l.hours
    jobSummary.set(key, cur)
  })

  const rows = daysInMonth.map(day => {
    const dateStr  = day.toISOString().split('T')[0]
    const dow      = day.getDay()
    const isWeekend = dow === 0 || dow === 6
    const holiday  = holidayMap.get(dateStr)
    const line     = lineMap.get(dateStr)
    const isLeave  = line?.line_type === 'leave'
    return { day, dateStr, dow, isWeekend, holiday, line, isLeave }
  })

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>Timesheet - ${data.employee.first_name_th} ${TH_MONTHS[data.timesheet.month-1]} ${thaiYear}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
  .page { width: 210mm; padding: 15mm 15mm; margin: 0 auto; background: #fff; }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px;
  }
  .header-logo { height: 56px; object-fit: contain; }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 { font-size: 18px; font-weight: 700; color: #1e3a8a; }
  .header-center p { font-size: 12px; color: #555; }
  .doc-id { font-size: 11px; color: #888; text-align: right; min-width: 140px; }
  .doc-title {
    text-align: center; font-size: 17px; font-weight: 700; color: #1e3a8a;
    margin-bottom: 16px; padding: 8px 0;
    border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;
  }
  .info-row { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; }
  .info-label { font-size: 12px; color: #666; min-width: 100px; }
  .info-value { font-size: 13px; font-weight: 500; color: #111; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  /* Table */
  .ts-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .ts-table th {
    background: #1e3a8a; color: #fff; padding: 7px 8px;
    font-size: 12px; font-weight: 600; text-align: center;
  }
  .ts-table td { padding: 5px 7px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  .ts-table tr:nth-child(even) td { background: #f9fafb; }
  .ts-table tr.weekend td { background: #f3f4f6; color: #9ca3af; }
  .ts-table tr.holiday td { background: #fef2f2; color: #dc2626; }
  .ts-table tr.leave-day td { background: #f0fdf4; color: #16a34a; }
  .ts-table .hours-col { text-align: center; font-weight: 600; color: #1e3a8a; }
  .ts-table .total-row td { background: #eff6ff; font-weight: 700; border-top: 2px solid #1e3a8a; }
  /* Summary */
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .summary-card {
    border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;
    text-align: center;
  }
  .summary-value { font-size: 24px; font-weight: 700; color: #1e3a8a; }
  .summary-label { font-size: 11px; color: #888; margin-top: 2px; }
  /* Job summary table */
  .job-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .job-table th { background: #f1f5f9; color: #374151; padding: 6px 10px; font-size: 12px; text-align: left; }
  .job-table td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  /* Signature */
  .sig-section {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 20px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;
  }
  .sig-box { text-align: center; }
  .sig-line { border-bottom: 1px solid #aaa; height: 40px; margin: 0 16px 6px; }
  .sig-label { font-size: 11px; color: #666; }
  .sig-name { font-size: 12px; font-weight: 600; margin-top: 2px; }
  .sig-date { font-size: 10px; color: #888; margin-top: 2px; }
  .footer {
    margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb;
    font-size: 10px; color: #aaa; display: flex; justify-content: space-between;
  }
  .status-badge {
    display: inline-block; padding: 2px 10px; border-radius: 10px;
    font-size: 12px; font-weight: 600;
  }
  .status-approved { background: #dcfce7; color: #16a34a; }
  .status-submitted { background: #fef3c7; color: #d97706; }
  .status-draft { background: #f3f4f6; color: #6b7280; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <img src="${logoSrc}" alt="${data.company.name_th}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-center">
      <h1>${data.company.name_th}</h1>
      <p>${data.company.name_en}</p>
    </div>
    <div class="doc-id">
      <div>เลขที่: TS-${data.timesheet.id.slice(-8).toUpperCase()}</div>
      <div style="margin-top:4px">พิมพ์: ${new Date().toLocaleDateString('th-TH')}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">Timesheet รายเดือน — ${monthName} ${thaiYear}</div>

  <!-- Employee Info -->
  <div class="info-grid">
    <div class="info-row">
      <span class="info-label">รหัสพนักงาน</span>
      <span class="info-value">${data.employee.employee_code}</span>
    </div>
    <div class="info-row">
      <span class="info-label">สถานะ</span>
      <span class="info-value">
        <span class="status-badge status-${data.timesheet.status}">
          ${data.timesheet.status === 'approved' ? 'อนุมัติแล้ว'
            : data.timesheet.status === 'submitted' ? 'รออนุมัติ' : 'ร่าง'}
        </span>
      </span>
    </div>
    <div class="info-row">
      <span class="info-label">ชื่อ-นามสกุล</span>
      <span class="info-value">${data.employee.first_name_th} ${data.employee.last_name_th}</span>
    </div>
    <div class="info-row">
      <span class="info-label">ตำแหน่ง</span>
      <span class="info-value">${data.employee.position_th ?? '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">แผนก</span>
      <span class="info-value">${data.employee.department ?? '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">รวมชั่วโมง</span>
      <span class="info-value" style="font-size:16px;color:#1e3a8a;font-weight:700;">${data.timesheet.total_hours} ชั่วโมง</span>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-value">${data.timesheet.total_hours}</div>
      <div class="summary-label">ชั่วโมงงาน</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${leaveLines.length}</div>
      <div class="summary-label">วันลา</div>
    </div>
  </div>

  <!-- Timesheet Table -->
  <table class="ts-table">
    <thead>
      <tr>
        <th style="width:30px">ที่</th>
        <th style="width:28px">วัน</th>
        <th style="width:90px">วันที่</th>
        <th>Job Code</th>
        <th>ชื่องาน</th>
        <th style="width:60px">ชม.</th>
        <th>หมายเหตุ</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, i) => {
        const cls = r.isWeekend ? 'weekend' : r.holiday ? 'holiday' : r.isLeave ? 'leave-day' : ''
        const jobCode = r.line?.job?.job_code ?? (r.isLeave ? 'ลา' : r.holiday ? 'หยุด' : '')
        const jobName = r.line?.job?.name_th  ?? (r.isLeave ? 'วันลา' : r.holiday ? r.holiday : '')
        const hours   = r.line?.hours ?? 0
        return `<tr class="${cls}">
          <td style="text-align:center">${i + 1}</td>
          <td style="text-align:center">${TH_DAYS[r.dow]}</td>
          <td>${r.day.getDate()} ${TH_MONTHS[r.day.getMonth()].slice(0,3)} ${r.day.getFullYear()+543}</td>
          <td style="font-family:monospace;font-size:11px">${jobCode}</td>
          <td>${jobName}</td>
          <td class="hours-col">${hours > 0 ? hours : r.isWeekend ? '—' : ''}</td>
          <td style="font-size:11px;color:#888">${r.line?.remark ?? ''}</td>
        </tr>`
      }).join('')}
      <tr class="total-row">
        <td colspan="5" style="text-align:right;padding-right:12px">รวมชั่วโมงทำงาน</td>
        <td class="hours-col" style="font-size:15px">${data.timesheet.total_hours}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <!-- Job Summary -->
  ${jobSummary.size > 0 ? `
  <div style="margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#1e3a8a;margin-bottom:8px;padding-left:4px;">สรุปชั่วโมงตาม Job</div>
    <table class="job-table">
      <thead><tr><th>Job Code</th><th>ชื่องาน</th><th style="text-align:right">ชั่วโมง</th></tr></thead>
      <tbody>
        ${Array.from(jobSummary.values()).map(j => `
          <tr>
            <td style="font-family:monospace">${j.code}</td>
            <td>${j.name}</td>
            <td style="text-align:right;font-weight:600">${j.hours}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

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
    <span>HiSafe-CON WorkSpace · ${data.company.name_th}</span>
    <span>เอกสารอัตโนมัติ · TS-${data.timesheet.id.slice(-8).toUpperCase()}</span>
  </div>
</div>
</body>
</html>`
}
