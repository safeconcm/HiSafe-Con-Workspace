// src/lib/pdf/certificate-template.ts
// HTML template for Employment Certificate ("หนังสือรับรองการทำงาน") PDF.
// Mirrors the visual language of leave-template.ts / timesheet-template.ts
// (same header/footer chrome) but the body reads as a formal letter, which
// is how Thai employment certificates are conventionally laid out.

export interface CertificateTemplateData {
  company: {
    code:    string
    name_th: string
    name_en: string
  }
  employee: {
    employee_code: string
    first_name_th: string
    last_name_th:  string
  }
  certificate: {
    id:             string
    cert_no:        string
    cert_type:      string
    purpose:        string | null
    issued_date:    string
    position_th:    string | null
    department:     string | null
    hire_date:      string | null
    salary_amount:  number | null
    include_salary: boolean
    is_voided?:     boolean
  }
  issued_by: {
    first_name_th: string
    last_name_th:  string
  } | null
}

const CERT_TYPE_TH: Record<string, string> = {
  employment:      'เพื่อรับรองว่าเป็นพนักงานของบริษัท',
  salary:          'เพื่อรับรองการทำงานและเงินเดือน',
  work_experience: 'เพื่อรับรองประสบการณ์การทำงาน',
  other:           'ตามที่พนักงานร้องขอ',
}

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function formatThaiDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`
}

export function generateCertificateHTML(data: CertificateTemplateData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`

  const c = data.certificate
  const fullName = `${data.employee.first_name_th} ${data.employee.last_name_th}`
  const purposeLine = c.purpose?.trim() || CERT_TYPE_TH[c.cert_type] || CERT_TYPE_TH.other

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>หนังสือรับรองการทำงาน - ${fullName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Sarabun', sans-serif;
    font-size: 15px;
    color: #1a1a1a;
    background: #fff;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 22mm 20mm;
    margin: 0 auto;
    background: #fff;
    position: relative;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 3px solid #1e3a8a;
    padding-bottom: 16px;
    margin-bottom: 28px;
  }
  .header-logo { height: 60px; object-fit: contain; }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 { font-size: 19px; font-weight: 700; color: #1e3a8a; }
  .header-center p { font-size: 12px; color: #555; margin-top: 2px; }
  .doc-id { font-size: 11px; color: #888; text-align: right; min-width: 140px; }

  .doc-title {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    color: #1e3a8a;
    margin-bottom: 6px;
    letter-spacing: 1px;
  }
  .doc-subtitle { text-align: center; font-size: 13px; color: #888; margin-bottom: 28px; }

  .letter-body { line-height: 2; font-size: 15px; text-align: justify; padding: 0 6px; }
  .letter-body p { margin-bottom: 14px; }
  .highlight { font-weight: 600; color: #111; }

  .info-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 20px;
    margin: 20px 0;
  }
  .info-row { display: flex; gap: 10px; padding: 4px 0; }
  .info-label { font-size: 13px; color: #666; min-width: 140px; }
  .info-value { font-size: 14px; font-weight: 600; color: #111; }

  .signature-section {
    margin-top: 56px;
    display: flex;
    justify-content: flex-end;
  }
  .sig-box { text-align: center; width: 240px; }
  .sig-line { border-bottom: 1px solid #aaa; height: 56px; margin: 0 10px 8px 10px; }
  .sig-name { font-size: 14px; font-weight: 600; color: #111; }
  .sig-title { font-size: 12px; color: #666; margin-top: 2px; }

  .watermark {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 90px;
    font-weight: 800;
    color: #dc2626;
    opacity: 0.08;
    pointer-events: none;
    white-space: nowrap;
  }

  .footer {
    position: absolute;
    bottom: 14mm;
    left: 20mm;
    right: 20mm;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    font-size: 10px;
    color: #aaa;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>
<div class="page">

  ${c.is_voided ? '<div class="watermark">ยกเลิกแล้ว</div>' : ''}

  <div class="header">
    <img src="${logoSrc}" alt="${data.company.name_th}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-center">
      <h1>${data.company.name_th}</h1>
      <p>${data.company.name_en}</p>
    </div>
    <div class="doc-id">
      <div>เลขที่: ${c.cert_no}</div>
      <div style="margin-top:4px">วันที่ออก: ${formatThaiDate(c.issued_date)}</div>
    </div>
  </div>

  <div class="doc-title">หนังสือรับรองการทำงาน</div>
  <div class="doc-subtitle">Certificate of Employment</div>

  <div class="letter-body">
    <p>
      หนังสือฉบับนี้ออกให้เพื่อรับรองว่า <span class="highlight">${fullName}</span>
      (รหัสพนักงาน ${data.employee.employee_code})
      เป็น${c.hire_date ? 'พนักงาน' : 'บุคคล'}ของ <span class="highlight">${data.company.name_th}</span>
      ${c.position_th ? `ดำรงตำแหน่ง <span class="highlight">${c.position_th}</span>` : ''}
      ${c.department ? `สังกัดแผนก <span class="highlight">${c.department}</span>` : ''}
      ${c.hire_date ? `ตั้งแต่วันที่ <span class="highlight">${formatThaiDate(c.hire_date)}</span> จนถึงปัจจุบัน` : ''}
    </p>
    <p>${purposeLine}</p>
  </div>

  <div class="info-box">
    <div class="info-row"><span class="info-label">ตำแหน่ง</span><span class="info-value">${c.position_th ?? '—'}</span></div>
    <div class="info-row"><span class="info-label">แผนก</span><span class="info-value">${c.department ?? '—'}</span></div>
    <div class="info-row"><span class="info-label">วันเริ่มงาน</span><span class="info-value">${formatThaiDate(c.hire_date)}</span></div>
    ${c.include_salary && c.salary_amount ? `
    <div class="info-row"><span class="info-label">อัตราเงินเดือน</span><span class="info-value">${Number(c.salary_amount).toLocaleString('th-TH')} บาท/เดือน</span></div>
    ` : ''}
  </div>

  <div class="letter-body">
    <p>จึงออกหนังสือรับรองฉบับนี้ไว้เพื่อใช้เป็นหลักฐาน${c.purpose ? `ในการ${c.purpose}` : ''}ต่อไป</p>
  </div>

  <div class="signature-section">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">${data.issued_by ? `${data.issued_by.first_name_th} ${data.issued_by.last_name_th}` : '.....................................'}</div>
      <div class="sig-title">ผู้มีอำนาจลงนาม / ฝ่ายบุคคล</div>
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
