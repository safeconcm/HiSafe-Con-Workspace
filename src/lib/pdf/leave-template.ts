// src/lib/pdf/leave-template.ts
// HTML template for Leave Request PDF
// Rendered by Puppeteer in the worker service

export interface LeaveTemplateData {
  company: {
    code:     string
    name_th:  string
    name_en:  string
    logo_url: string | null
  }
  employee: {
    employee_code: string
    first_name_th: string
    last_name_th:  string
    position_th:   string | null
    department:    string | null
  }
  leave: {
    id:              string
    leave_type:      string
    leave_type_th:   string
    start_date:      string
    end_date:        string
    total_days:      number
    is_half_day:     boolean
    half_day_period: string | null
    reason:          string | null
    status:          string
    created_at:      string
  }
  approver?: {
    first_name_th: string
    last_name_th:  string
    approved_at:   string | null
  } | null
  signatures?: {
    employee_url?: string | null
    employee_at?:  string | null
    hr_url?:       string | null
    hr_at?:        string | null
  }
  approvals: {
    action:        string
    approver_name: string | null
    comment:       string | null
    acted_at:      string
  }[]
}

const LEAVE_TYPE_TH: Record<string, string> = {
  annual:    'พักร้อน',
  sick:      'ลาป่วย',
  personal:  'ลากิจ',
  maternity: 'ลาคลอด',
  other:     'อื่นๆ',
}

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

function formatThaiDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  return `${formatThaiDate(dateStr)} เวลา ${time} น.`
}

export function generateLeaveHTML(data: LeaveTemplateData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`

  const isApproved = data.leave.status === 'approved'
  const leaveTypeTh = LEAVE_TYPE_TH[data.leave.leave_type] ?? data.leave.leave_type

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ใบลา - ${data.employee.first_name_th} ${data.employee.last_name_th}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Sarabun', sans-serif;
    font-size: 13px;
    color: #1a1a1a;
    background: #fff;
    padding: 0;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 12mm 15mm;
    margin: 0 auto;
    background: #fff;
    overflow: hidden;
  }
  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .header-logo { height: 40px; object-fit: contain; }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 {
    font-size: 16px;
    font-weight: 700;
    color: #1e3a8a;
  }
  .header-center p { font-size: 10px; color: #555; margin-top: 2px; }
  .doc-id {
    font-size: 9px;
    color: #888;
    text-align: right;
    min-width: 130px;
  }
  /* Title */
  .doc-title {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: #1e3a8a;
    margin-bottom: 10px;
    padding: 5px 0;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    letter-spacing: 0.5px;
  }
  /* Sections */
  .section { margin-bottom: 8px; }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: #1e3a8a;
    background: #eff6ff;
    padding: 3px 10px;
    border-left: 3px solid #1e3a8a;
    margin-bottom: 6px;
    border-radius: 0 4px 4px 0;
  }
  /* Info grid */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px 16px;
    padding: 0 4px;
  }
  .info-row { display: flex; gap: 8px; align-items: baseline; }
  .info-label { font-size: 11px; color: #666; white-space: nowrap; min-width: 95px; }
  .info-value { font-size: 12px; font-weight: 500; color: #111; border-bottom: 1px solid #e5e7eb; flex: 1; padding-bottom: 1px; }
  .info-row.full { grid-column: 1/-1; }
  /* Leave type badge */
  .type-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .type-annual   { background: #dbeafe; color: #1d4ed8; }
  .type-sick     { background: #fee2e2; color: #dc2626; }
  .type-personal { background: #fef3c7; color: #d97706; }
  .type-maternity{ background: #fce7f3; color: #be185d; }
  .type-other    { background: #f3f4f6; color: #374151; }
  /* Date box */
  .date-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 14px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 8px;
  }
  .date-item { text-align: center; }
  .date-item-label { font-size: 10px; color: #888; margin-bottom: 3px; }
  .date-item-value { font-size: 13px; font-weight: 600; color: #1e3a8a; }
  .date-days { color: #dc2626; }
  /* Reason box */
  .reason-box {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 6px 10px;
    min-height: 34px;
    max-height: 60px;
    overflow: hidden;
    background: #fafafa;
    font-size: 12px;
    color: #333;
    line-height: 1.5;
  }
  /* Approval timeline */
  .approval-timeline { display: flex; flex-direction: column; gap: 5px; padding: 0 4px; }
  .approval-item { display: flex; align-items: flex-start; gap: 8px; }
  .approval-icon {
    width: 20px; height: 20px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; flex-shrink: 0; margin-top: 1px;
  }
  .icon-approved  { background: #dcfce7; }
  .icon-rejected  { background: #fee2e2; }
  .icon-auto      { background: #ede9fe; }
  .approval-body { flex: 1; }
  .approval-name { font-size: 11px; font-weight: 600; color: #111; }
  .approval-action-approved { color: #16a34a; font-weight: 600; }
  .approval-action-rejected { color: #dc2626; font-weight: 600; }
  .approval-time { font-size: 9px; color: #888; margin-top: 1px; }
  .approval-comment { font-size: 10px; color: #555; margin-top: 2px; font-style: italic; }
  /* Signature section */
  .signature-section {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-top: 14px;
    border-top: 1px solid #e5e7eb;
    padding-top: 10px;
  }
  .sig-box { text-align: center; }
  .sig-line {
    border-bottom: 1px solid #aaa;
    height: 30px;
    margin-bottom: 5px;
    margin: 0 16px 5px 16px;
  }
  .sig-image {
    height: 30px;
    margin: 0 16px 5px 16px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    border-bottom: 1px solid #aaa;
  }
  .sig-image img { max-height: 28px; max-width: 100%; object-fit: contain; }
  .sig-label { font-size: 10px; color: #555; margin-bottom: 2px; }
  .sig-name  { font-size: 11px; font-weight: 600; color: #111; }
  .sig-date  { font-size: 9px; color: #888; margin-top: 1px; }
  /* Status watermark */
  .watermark {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 72px;
    font-weight: 800;
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
    white-space: nowrap;
  }
  .watermark-approved { color: #16a34a; }
  .watermark-rejected { color: #dc2626; }
  .watermark-pending  { color: #d97706; }
  /* Footer */
  .footer {
    padding-top: 6px;
    border-top: 1px solid #e5e7eb;
    font-size: 8px;
    color: #aaa;
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
  }
</style>
</head>
<body>
<div class="page">

  <!-- Watermark -->
  <div class="watermark ${
    data.leave.status === 'approved' ? 'watermark-approved'
    : data.leave.status === 'rejected' ? 'watermark-rejected'
    : 'watermark-pending'
  }">
    ${data.leave.status === 'approved' ? 'อนุมัติแล้ว'
      : data.leave.status === 'rejected' ? 'ไม่อนุมัติ'
      : 'รออนุมัติ'}
  </div>

  <!-- Header -->
  <div class="header">
    <img src="${logoSrc}" alt="${data.company.name_th}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-center">
      <h1>${data.company.name_th}</h1>
      <p>${data.company.name_en}</p>
    </div>
    <div class="doc-id">
      <div>เลขที่: LV-${data.leave.id.slice(-8).toUpperCase()}</div>
      <div style="margin-top:4px">วันที่ยื่น: ${formatThaiDate(data.leave.created_at)}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">ใบลาประเภท${leaveTypeTh}</div>

  <!-- Employee Info -->
  <div class="section">
    <div class="section-title">ข้อมูลพนักงาน</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">รหัสพนักงาน</span>
        <span class="info-value">${data.employee.employee_code}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ประเภทลา</span>
        <span class="info-value">
          <span class="type-badge type-${data.leave.leave_type}">${leaveTypeTh}</span>
        </span>
      </div>
      <div class="info-row full">
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
    </div>
  </div>

  <!-- Leave Date -->
  <div class="section">
    <div class="section-title">รายละเอียดการลา</div>
    <div class="date-box">
      <div class="date-item">
        <div class="date-item-label">วันที่เริ่มลา</div>
        <div class="date-item-value">${formatThaiDate(data.leave.start_date)}</div>
      </div>
      <div class="date-item">
        <div class="date-item-label">วันที่สิ้นสุดลา</div>
        <div class="date-item-value">${formatThaiDate(data.leave.end_date)}</div>
      </div>
      <div class="date-item">
        <div class="date-item-label">จำนวนวันลา</div>
        <div class="date-item-value date-days">
          ${data.leave.is_half_day
            ? `0.5 วัน (${data.leave.half_day_period === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย'})`
            : `${data.leave.total_days} วัน`}
        </div>
      </div>
    </div>

    <div style="padding: 0 4px;">
      <div class="info-label" style="margin-bottom:6px;">เหตุผลการลา</div>
      <div class="reason-box">${data.leave.reason ?? '(ไม่ระบุเหตุผล)'}</div>
    </div>
  </div>

  <!-- Approval History -->
  ${data.approvals.length > 0 ? `
  <div class="section">
    <div class="section-title">ประวัติการอนุมัติ</div>
    <div class="approval-timeline">
      ${data.approvals.map(ap => `
        <div class="approval-item">
          <div class="approval-icon ${
            ap.action === 'approved' || ap.action === 'auto_approved' ? 'icon-approved'
            : ap.action === 'rejected' ? 'icon-rejected'
            : 'icon-auto'
          }">
            ${ap.action === 'approved' || ap.action === 'auto_approved' ? '✓'
              : ap.action === 'rejected' ? '✗' : 'i'}
          </div>
          <div class="approval-body">
            <div>
              <span class="approval-name">${ap.approver_name ?? 'ระบบ'}</span>
              <span class="${ap.action.includes('approved') ? 'approval-action-approved' : 'approval-action-rejected'}" style="margin-left:8px;">
                ${ap.action === 'approved' ? 'อนุมัติ'
                  : ap.action === 'auto_approved' ? 'อนุมัติอัตโนมัติ'
                  : ap.action === 'rejected' ? 'ไม่อนุมัติ'
                  : ap.action === 'noted' ? 'รับทราบ' : ap.action}
              </span>
            </div>
            <div class="approval-time">${formatThaiDateTime(ap.acted_at)}</div>
            ${ap.comment ? `<div class="approval-comment">"${ap.comment}"</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <!-- Signature Section -->
  <div class="signature-section">
    <div class="sig-box">
      ${data.signatures?.employee_url
        ? `<div class="sig-image"><img src="${data.signatures.employee_url}" alt="ลายเซ็นพนักงาน" /></div>`
        : `<div class="sig-line"></div>`}
      <div class="sig-label">ลงชื่อผู้ขอลา</div>
      <div class="sig-name">${data.employee.first_name_th} ${data.employee.last_name_th}</div>
      <div class="sig-date">${
        data.signatures?.employee_at
          ? `เซ็นดิจิทัล ${formatThaiDate(data.signatures.employee_at)}`
          : `วันที่ ${formatThaiDate(data.leave.created_at)}`
      }</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">ลงชื่อผู้อนุมัติ</div>
      <div class="sig-name">${
        data.approver
          ? `${data.approver.first_name_th} ${data.approver.last_name_th}`
          : '...................................'
      }</div>
      <div class="sig-date">${
        data.approver?.approved_at
          ? `วันที่ ${formatThaiDate(data.approver.approved_at)}`
          : '&nbsp;'
      }</div>
    </div>
    <div class="sig-box">
      ${data.signatures?.hr_url
        ? `<div class="sig-image"><img src="${data.signatures.hr_url}" alt="ลายเซ็น HR" /></div>`
        : `<div class="sig-line"></div>`}
      <div class="sig-label">ลงชื่อ HR รับทราบ</div>
      <div class="sig-name">${data.signatures?.hr_at ? 'รับทราบแล้ว' : '...'}</div>
      <div class="sig-date">${
        data.signatures?.hr_at
          ? `เซ็นดิจิทัล ${formatThaiDate(data.signatures.hr_at)}`
          : '&nbsp;'
      }</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>HiSafe-CON WorkSpace · ${data.company.name_th}</span>
    <span>เอกสารนี้สร้างโดยระบบอัตโนมัติ · ${new Date().toLocaleDateString('th-TH')}</span>
  </div>

</div>
</body>
</html>`
}
