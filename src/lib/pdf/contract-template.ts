// src/lib/pdf/contract-template.ts
// HTML template for the employment contract ("สัญญาจ้างงาน") PDF.
// Mirrors the header/footer chrome of certificate-template.ts / leave-template.ts,
// but the body is laid out as a numbered formal contract (parties, terms,
// salary, probation, notice, signatures) rather than a single-page notice —
// contracts can legitimately run to a second page, so unlike the leave/
// certificate templates this one does NOT force a fixed 297mm height with
// overflow:hidden; it lets Puppeteer paginate naturally across page breaks.

export interface ContractTemplateData {
  company: {
    code:    string
    name_th: string
    name_en: string
    legal_name_th?: string | null
    address_th?: string | null
    tax_id?: string | null
    phone?: string | null
    contact_email?: string | null
  }
  employee: {
    employee_code: string
    first_name_th: string
    last_name_th:  string
  }
  contract: {
    id:             string
    contract_no:    string
    contract_type:  string
    status:         string
    start_date:     string
    end_date:       string | null
    position_th:    string | null
    position_en:    string | null
    department:     string | null
    work_location:  string | null
    probation_days: number
    probation_end:  string | null
    base_salary:    number
    salary_type:    string
    overtime_rate:  number | null
    allowances:     Record<string, number> | null
    benefits:       string[] | null
    notice_days:    number | null
    notes:          string | null
    signed_by_employee: boolean
    signed_by_hr:       boolean
    signed_at:          string | null
    created_at:         string
  }
  authorized_signer?: {
    first_name_th: string
    last_name_th:  string
  } | null
}

import { letterheadName, letterheadMetaHTML } from './company-letterhead'

const CONTRACT_TYPE_TH: Record<string, string> = {
  permanent:  'พนักงานประจำ (ไม่มีกำหนดระยะเวลา)',
  fixed_term: 'สัญญาจ้าง (มีกำหนดระยะเวลา)',
  part_time:  'พนักงานพาร์ทไทม์',
  intern:     'นักศึกษาฝึกงาน',
  outsource:  'พนักงานเอาท์ซอร์ส',
}

const SALARY_TYPE_TH: Record<string, string> = {
  monthly: 'บาท/เดือน',
  daily:   'บาท/วัน',
  hourly:  'บาท/ชั่วโมง',
}

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function formatThaiDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`
}

function formatMoney(n: number): string {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function generateContractHTML(data: ContractTemplateData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`

  const c = data.contract
  const fullName     = `${data.employee.first_name_th} ${data.employee.last_name_th}`
  const typeTh       = CONTRACT_TYPE_TH[c.contract_type] ?? c.contract_type
  const salaryUnit   = SALARY_TYPE_TH[c.salary_type] ?? ''
  const allowanceRows = Object.entries(c.allowances ?? {}).filter(([, v]) => Number(v) > 0)
  const benefitRows   = (c.benefits ?? []).filter(Boolean)

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>สัญญาจ้างงาน - ${fullName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Sarabun', sans-serif;
    font-size: 12.5px;
    color: #1a1a1a;
    background: #fff;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 18mm;
    margin: 0 auto;
    background: #fff;
    position: relative;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .header-logo { height: 42px; object-fit: contain; }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 { font-size: 16px; font-weight: 700; color: #1e3a8a; }
  .header-center p { font-size: 10px; color: #555; margin-top: 2px; }
  .header-center .meta { font-size: 8px; color: #777; margin-top: 1px; }
  .doc-id { font-size: 9px; color: #888; text-align: right; min-width: 140px; }

  .doc-title { text-align: center; font-size: 17px; font-weight: 700; color: #1e3a8a; margin-bottom: 2px; letter-spacing: 1px; }
  .doc-subtitle { text-align: center; font-size: 11px; color: #888; margin-bottom: 16px; }

  .intro { font-size: 12.5px; line-height: 1.7; text-align: justify; margin-bottom: 14px; }
  .intro .highlight { font-weight: 600; }

  .clause { margin-bottom: 11px; break-inside: avoid; }
  .clause-title {
    font-size: 12px; font-weight: 700; color: #1e3a8a;
    background: #eff6ff; padding: 4px 10px; border-left: 3px solid #1e3a8a;
    border-radius: 0 4px 4px 0; margin-bottom: 6px;
  }
  .clause-body { font-size: 12px; line-height: 1.65; padding: 0 4px; }
  .clause-body p { margin-bottom: 4px; }

  table.terms { width: 100%; border-collapse: collapse; margin: 4px 0 2px; }
  table.terms td { padding: 3px 4px; font-size: 12px; vertical-align: top; }
  table.terms td.label { color: #666; width: 150px; white-space: nowrap; }
  table.terms td.value { font-weight: 600; color: #111; }

  ul.plain { padding-left: 4px; list-style: none; }
  ul.plain li { font-size: 12px; padding: 1px 0 1px 14px; position: relative; }
  ul.plain li::before { content: '•'; position: absolute; left: 0; color: #1e3a8a; }

  .signature-section {
    margin-top: 26px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    break-inside: avoid;
  }
  .sig-box { text-align: center; }
  .sig-line { border-bottom: 1px solid #aaa; height: 34px; margin: 0 14px 6px 14px; }
  .sig-label { font-size: 11px; color: #555; margin-bottom: 2px; }
  .sig-name  { font-size: 12px; font-weight: 600; color: #111; }
  .sig-title { font-size: 10px; color: #666; margin-top: 2px; }
  .sig-date  { font-size: 9px; color: #888; margin-top: 3px; }

  .watermark {
    position: absolute;
    top: 40%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 90px;
    font-weight: 800;
    color: #dc2626;
    opacity: 0.07;
    pointer-events: none;
    white-space: nowrap;
    z-index: 0;
  }

  .footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    font-size: 8px;
    color: #aaa;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>
<div class="page">

  ${c.status === 'terminated' ? '<div class="watermark">สิ้นสุดสัญญา</div>' : ''}

  <div class="header">
    <img src="${logoSrc}" alt="${data.company.name_th}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-center">
      <h1>${letterheadName(data.company)}</h1>
      ${letterheadMetaHTML(data.company)}
    </div>
    <div class="doc-id">
      <div>เลขที่สัญญา: ${c.contract_no}</div>
      <div style="margin-top:4px">วันที่ทำสัญญา: ${formatThaiDate(c.created_at)}</div>
    </div>
  </div>

  <div class="doc-title">สัญญาจ้างงาน</div>
  <div class="doc-subtitle">Employment Contract</div>

  <div class="intro">
    สัญญาฉบับนี้ทำขึ้นระหว่าง <span class="highlight">${data.company.name_th}</span> ซึ่งต่อไปในสัญญานี้เรียกว่า
    &ldquo;นายจ้าง&rdquo; ฝ่ายหนึ่ง กับ <span class="highlight">${fullName}</span>
    (รหัสพนักงาน ${data.employee.employee_code}) ซึ่งต่อไปในสัญญานี้เรียกว่า &ldquo;ลูกจ้าง&rdquo; อีกฝ่ายหนึ่ง
    ทั้งสองฝ่ายตกลงทำสัญญาจ้างงานกัน โดยมีข้อความและเงื่อนไขดังต่อไปนี้
  </div>

  <div class="clause">
    <div class="clause-title">1. ประเภทการจ้างและตำแหน่งงาน</div>
    <div class="clause-body">
      <table class="terms">
        <tr><td class="label">ประเภทการจ้าง</td><td class="value">${typeTh}</td></tr>
        <tr><td class="label">ตำแหน่ง</td><td class="value">${c.position_th ?? '—'}${c.position_en ? ` (${c.position_en})` : ''}</td></tr>
        <tr><td class="label">แผนก</td><td class="value">${c.department ?? '—'}</td></tr>
        <tr><td class="label">สถานที่ปฏิบัติงาน</td><td class="value">${c.work_location ?? '—'}</td></tr>
      </table>
    </div>
  </div>

  <div class="clause">
    <div class="clause-title">2. ระยะเวลาการจ้างงาน</div>
    <div class="clause-body">
      <table class="terms">
        <tr><td class="label">วันเริ่มงาน</td><td class="value">${formatThaiDate(c.start_date)}</td></tr>
        <tr><td class="label">วันสิ้นสุดสัญญา</td><td class="value">${c.end_date ? formatThaiDate(c.end_date) : 'ไม่มีกำหนด (สัญญาจ้างประจำ)'}</td></tr>
      </table>
    </div>
  </div>

  ${c.probation_days > 0 ? `
  <div class="clause">
    <div class="clause-title">3. การทดลองงาน</div>
    <div class="clause-body">
      <p>ลูกจ้างจะต้องผ่านการทดลองงานเป็นระยะเวลา <span style="font-weight:600">${c.probation_days} วัน</span>
      นับจากวันเริ่มงาน โดยครบกำหนดวันที่ <span style="font-weight:600">${formatThaiDate(c.probation_end)}</span>
      ทั้งนี้นายจ้างขอสงวนสิทธิ์ในการประเมินผลการทำงานและพิจารณาบรรจุเป็นพนักงานประจำเมื่อครบกำหนดระยะเวลาดังกล่าว</p>
    </div>
  </div>
  ` : ''}

  <div class="clause">
    <div class="clause-title">${c.probation_days > 0 ? '4' : '3'}. ค่าจ้างและค่าตอบแทน</div>
    <div class="clause-body">
      <table class="terms">
        <tr><td class="label">อัตราค่าจ้าง</td><td class="value">${formatMoney(c.base_salary)} ${salaryUnit}</td></tr>
        ${c.overtime_rate ? `<tr><td class="label">อัตราค่าล่วงเวลา</td><td class="value">${c.overtime_rate} เท่าของอัตราค่าจ้างปกติ</td></tr>` : ''}
      </table>
      ${allowanceRows.length > 0 ? `
        <p style="margin-top:4px;color:#666;font-size:11px;">เงินเพิ่มพิเศษ:</p>
        <ul class="plain">
          ${allowanceRows.map(([name, amount]) => `<li>${name}: ${formatMoney(Number(amount))} บาท</li>`).join('')}
        </ul>
      ` : ''}
    </div>
  </div>

  ${benefitRows.length > 0 ? `
  <div class="clause">
    <div class="clause-title">${c.probation_days > 0 ? '5' : '4'}. สวัสดิการ</div>
    <div class="clause-body">
      <ul class="plain">
        ${benefitRows.map(b => `<li>${b}</li>`).join('')}
      </ul>
    </div>
  </div>
  ` : ''}

  <div class="clause">
    <div class="clause-title">${(c.probation_days > 0 ? 1 : 0) + (benefitRows.length > 0 ? 1 : 0) + 4}. การบอกเลิกสัญญา</div>
    <div class="clause-body">
      <p>ฝ่ายใดฝ่ายหนึ่งประสงค์จะเลิกสัญญาจ้างฉบับนี้ จะต้องแจ้งให้อีกฝ่ายทราบล่วงหน้าเป็นลายลักษณ์อักษรไม่น้อยกว่า
      <span style="font-weight:600">${c.notice_days ?? 30} วัน</span> เว้นแต่กรณีที่กฎหมายแรงงานกำหนดไว้เป็นอย่างอื่น</p>
    </div>
  </div>

  ${c.notes ? `
  <div class="clause">
    <div class="clause-title">${(c.probation_days > 0 ? 1 : 0) + (benefitRows.length > 0 ? 1 : 0) + 5}. เงื่อนไขเพิ่มเติม</div>
    <div class="clause-body"><p>${c.notes}</p></div>
  </div>
  ` : ''}

  <div class="clause">
    <div class="clause-body">
      <p>สัญญาฉบับนี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความในสัญญานี้โดยตลอดแล้ว
      จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน</p>
    </div>
  </div>

  <div class="signature-section">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">ลงชื่อนายจ้าง / ผู้มีอำนาจลงนาม</div>
      <div class="sig-name">${
        data.authorized_signer
          ? `${data.authorized_signer.first_name_th} ${data.authorized_signer.last_name_th}`
          : '.....................................'
      }</div>
      <div class="sig-title">${data.company.name_th}</div>
      <div class="sig-date">${c.signed_by_hr && c.signed_at ? `ลงนามเมื่อ ${formatThaiDate(c.signed_at)}` : '&nbsp;'}</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">ลงชื่อลูกจ้าง</div>
      <div class="sig-name">${fullName}</div>
      <div class="sig-title">รหัสพนักงาน ${data.employee.employee_code}</div>
      <div class="sig-date">${c.signed_by_employee && c.signed_at ? `ลงนามเมื่อ ${formatThaiDate(c.signed_at)}` : '&nbsp;'}</div>
    </div>
  </div>

  <div class="footer">
    <span>HiSafe-CON WorkSpace · ${data.company.name_th}</span>
    <span>เอกสารนี้สร้างโดยระบบอัตโนมัติ · ${new Date().toLocaleDateString('th-TH')}</span>
  </div>

</div>
</body>
</html>`
}
