// src/lib/pdf/employee-summary-template.ts
// HTML template for the 1-page "Employee Profile Summary" PDF
// (สรุปข้อมูลพนักงาน) — a quick-reference printout combining what's
// otherwise spread across the admin "employee 360" page (basic info,
// current contract, leave balances, reporting line). Deliberately a single
// fixed-height A4 page like leave-template.ts / certificate-template.ts —
// this is a snapshot/reference document, not a variable-length legal one
// like the contract — and deliberately omits salary figures (this can be
// downloaded by the employee themselves for their own reference, not just
// HR, so it stays out unlike the opt-in salary line on employment
// certificates).

export interface EmployeeSummaryTemplateData {
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
    first_name_en: string | null
    last_name_en:  string | null
    position_th:   string | null
    department:    string | null
    role:          string
    status:        string
    hire_date:     string
    phone:         string | null
    email:         string
    avatar_url:    string | null
  }
  supervisor: { first_name_th: string; last_name_th: string } | null
  contract: {
    contract_no:    string
    contract_type:  string
    status:         string
    start_date:     string
    end_date:       string | null
    work_location:  string | null
    probation_status: string | null
    probation_end:  string | null
  } | null
  balances: {
    leave_type:      string
    quota_days:      number
    carried_forward: number
    adjusted_days:   number
    used_days:       number
    pending_days:    number
    available_days:  number
  }[]
  generated_at: string
}

import { letterheadName, letterheadMetaHTML } from './company-letterhead'

const ROLE_TH: Record<string, string> = {
  employee: 'พนักงาน', supervisor: 'หัวหน้างาน', hr: 'ฝ่ายบุคคล', admin: 'ผู้ดูแลระบบ',
}
const STATUS_TH: Record<string, string> = {
  active: 'ทำงานอยู่', inactive: 'ระงับการใช้งาน', resigned: 'ลาออกแล้ว',
}
const CONTRACT_TYPE_TH: Record<string, string> = {
  permanent: 'พนักงานประจำ', fixed_term: 'สัญญาจ้าง (มีกำหนด)', part_time: 'พาร์ทไทม์',
  intern: 'ฝึกงาน', outsource: 'เอาท์ซอร์ส',
}
const CONTRACT_STATUS_TH: Record<string, string> = {
  draft: 'ร่าง', active: 'มีผล', expired: 'หมดอายุ', terminated: 'สิ้นสุด',
}
const LEAVE_TYPE_TH: Record<string, string> = {
  annual: 'พักร้อน', sick: 'ลาป่วย', personal: 'ลากิจ', maternity: 'ลาคลอด', other: 'อื่นๆ',
}

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function formatThaiDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`
}

export function generateEmployeeSummaryHTML(data: EmployeeSummaryTemplateData, appUrl: string): string {
  const logoSrc = data.company.code === 'HIGHCON'
    ? `${appUrl}/logos/highcon.png`
    : `${appUrl}/logos/safecon.png`

  const e = data.employee
  const fullNameTh = `${e.first_name_th} ${e.last_name_th}`
  const fullNameEn = e.first_name_en && e.last_name_en ? `${e.first_name_en} ${e.last_name_en}` : null
  const c = data.contract

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>สรุปข้อมูลพนักงาน - ${fullNameTh}</title>
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
    height: 297mm;
    padding: 14mm 16mm;
    margin: 0 auto;
    background: #fff;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
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
  .header-center h1 { font-size: 16px; font-weight: 700; color: #1e3a8a; }
  .header-center p { font-size: 10px; color: #555; margin-top: 2px; }
  .header-center .meta { font-size: 8px; color: #777; margin-top: 1px; }
  .doc-id { font-size: 9px; color: #888; text-align: right; min-width: 130px; }

  .doc-title {
    text-align: center; font-size: 15px; font-weight: 700; color: #1e3a8a;
    margin-bottom: 12px; padding: 5px 0;
    border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;
    letter-spacing: 0.5px;
  }

  .profile-row { display: flex; gap: 16px; margin-bottom: 12px; align-items: center; }
  .avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0; flex-shrink: 0; }
  .avatar-fallback {
    width: 64px; height: 64px; border-radius: 50%; background: #dbeafe; color: #1d4ed8;
    display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; flex-shrink: 0;
  }
  .profile-name-th { font-size: 17px; font-weight: 700; color: #111; }
  .profile-name-en { font-size: 11px; color: #666; margin-top: 1px; }
  .profile-meta { font-size: 11px; color: #555; margin-top: 3px; }
  .status-badge {
    display: inline-block; padding: 1px 8px; border-radius: 8px; font-size: 10px; font-weight: 600; margin-left: 6px;
  }
  .status-active { background: #dcfce7; color: #16a34a; }
  .status-inactive { background: #f3f4f6; color: #6b7280; }
  .status-resigned { background: #fee2e2; color: #dc2626; }

  .section { margin-bottom: 10px; }
  .section-title {
    font-size: 11px; font-weight: 600; color: #1e3a8a;
    background: #eff6ff; padding: 3px 10px; border-left: 3px solid #1e3a8a;
    margin-bottom: 6px; border-radius: 0 4px 4px 0;
  }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 16px; padding: 0 4px; }
  .info-row { display: flex; gap: 8px; align-items: baseline; }
  .info-label { font-size: 11px; color: #666; white-space: nowrap; min-width: 95px; }
  .info-value { font-size: 12px; font-weight: 500; color: #111; border-bottom: 1px solid #e5e7eb; flex: 1; padding-bottom: 1px; }

  table.balance { width: 100%; border-collapse: collapse; margin-top: 2px; }
  table.balance th {
    font-size: 10px; color: #666; font-weight: 600; text-align: center; padding: 4px 6px;
    background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  }
  table.balance th:first-child { text-align: left; }
  table.balance td { font-size: 11.5px; text-align: center; padding: 4px 6px; border-bottom: 1px solid #f1f5f9; }
  table.balance td:first-child { text-align: left; font-weight: 500; color: #111; }
  table.balance td.avail { font-weight: 700; color: #1e3a8a; }

  .footer {
    margin-top: auto;
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

  <div class="header">
    <img src="${logoSrc}" alt="${data.company.name_th}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-center">
      <h1>${letterheadName(data.company)}</h1>
      ${letterheadMetaHTML(data.company)}
    </div>
    <div class="doc-id">
      <div>รหัสพนักงาน: ${e.employee_code}</div>
      <div style="margin-top:4px">วันที่ออกเอกสาร: ${formatThaiDate(data.generated_at)}</div>
    </div>
  </div>

  <div class="doc-title">สรุปข้อมูลพนักงาน · Employee Profile Summary</div>

  <div class="profile-row">
    ${e.avatar_url
      ? `<img src="${e.avatar_url}" class="avatar" alt="${fullNameTh}" onerror="this.style.display='none'" />`
      : `<div class="avatar-fallback">${e.first_name_th.charAt(0)}</div>`}
    <div>
      <div class="profile-name-th">${fullNameTh}${
        `<span class="status-badge status-${e.status}">${STATUS_TH[e.status] ?? e.status}</span>`
      }</div>
      ${fullNameEn ? `<div class="profile-name-en">${fullNameEn}</div>` : ''}
      <div class="profile-meta">${e.position_th ?? '—'}${e.department ? ` · ${e.department}` : ''} · ${ROLE_TH[e.role] ?? e.role}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">ข้อมูลติดต่อและการทำงาน</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">อีเมล</span><span class="info-value">${e.email}</span></div>
      <div class="info-row"><span class="info-label">เบอร์โทร</span><span class="info-value">${e.phone ?? '—'}</span></div>
      <div class="info-row"><span class="info-label">วันเริ่มงาน</span><span class="info-value">${formatThaiDate(e.hire_date)}</span></div>
      <div class="info-row"><span class="info-label">ผู้บังคับบัญชา</span><span class="info-value">${
        data.supervisor ? `${data.supervisor.first_name_th} ${data.supervisor.last_name_th}` : 'ไม่มี (ระดับสูงสุด)'
      }</span></div>
    </div>
  </div>

  ${c ? `
  <div class="section">
    <div class="section-title">สัญญาจ้างปัจจุบัน</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">เลขที่สัญญา</span><span class="info-value">${c.contract_no}</span></div>
      <div class="info-row"><span class="info-label">ประเภท</span><span class="info-value">${CONTRACT_TYPE_TH[c.contract_type] ?? c.contract_type}</span></div>
      <div class="info-row"><span class="info-label">วันเริ่มสัญญา</span><span class="info-value">${formatThaiDate(c.start_date)}</span></div>
      <div class="info-row"><span class="info-label">วันสิ้นสุดสัญญา</span><span class="info-value">${c.end_date ? formatThaiDate(c.end_date) : 'ไม่มีกำหนด'}</span></div>
      <div class="info-row"><span class="info-label">สถานที่ทำงาน</span><span class="info-value">${c.work_location ?? '—'}</span></div>
      <div class="info-row"><span class="info-label">สถานะสัญญา</span><span class="info-value">${CONTRACT_STATUS_TH[c.status] ?? c.status}</span></div>
      ${c.probation_status ? `
      <div class="info-row" style="grid-column:1/-1;"><span class="info-label">ทดลองงาน</span><span class="info-value">${c.probation_status}${c.probation_end ? ` · ครบกำหนด ${formatThaiDate(c.probation_end)}` : ''}</span></div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">ยอดวันลา ปี ${new Date(data.generated_at).getFullYear() + 543}</div>
    <table class="balance">
      <thead>
        <tr><th>ประเภทลา</th><th>Quota</th><th>สะสม</th><th>ปรับ</th><th>ใช้ไป</th><th>รออนุมัติ</th><th>คงเหลือ</th></tr>
      </thead>
      <tbody>
        ${(['annual','sick','personal','maternity','other']).map(lt => {
          const b = data.balances.find(x => x.leave_type === lt)
          if (!b) return `<tr><td>${LEAVE_TYPE_TH[lt]}</td><td colspan="6" style="color:#ccc;">—</td></tr>`
          return `<tr>
            <td>${LEAVE_TYPE_TH[lt]}</td>
            <td>${b.quota_days}</td>
            <td>${b.carried_forward}</td>
            <td>${b.adjusted_days > 0 ? `+${b.adjusted_days}` : b.adjusted_days}</td>
            <td>${b.used_days}</td>
            <td>${b.pending_days}</td>
            <td class="avail">${b.available_days}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <span>CONNEX · ${data.company.name_th}</span>
    <span>เอกสารนี้สร้างโดยระบบอัตโนมัติ · ${new Date().toLocaleDateString('th-TH')}</span>
  </div>

</div>
</body>
</html>`
}
