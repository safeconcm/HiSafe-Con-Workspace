// src/lib/pdf/job-codes-list-template.ts
// HTML template for the "Job Codes" list export PDF (2026-10-21, "ควรจะ
// export ออกมาเป็น PDF excel csv"). A report, not a fixed-size notice/
// certificate — the row count is unbounded (up to 500 Jobs), so like
// contract-template.ts this does NOT force a fixed page height with
// overflow:hidden; Puppeteer paginates naturally across page breaks.
// Landscape A4 (see the `landscape: true` call in the API route) because
// the table has 7 columns including two free-text ones (ชื่องาน, ลูกค้า).
//
// Mirrors exactly what's on screen: the group headers, group order, and
// per-group row order all come from src/lib/jobs-grouping.ts's groupJobs()
// — the same function the Jobs page itself uses — so this PDF, the CSV/
// Excel exports, and the live page can never silently drift apart.

import { companyLogoDataUri } from './company-logo'
import { letterheadName, letterheadMetaHTML } from './company-letterhead'
import { groupJobs, type JobGroupBy } from '../jobs-grouping'

export interface JobCodesListTemplateData {
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
  year: number
  groupBy: JobGroupBy
  search: string
  jobs: any[]
  revenueTotal: number | null
  generated_at: string
}

const STATUS_TH: Record<string, string> = {
  active: 'เปิดใช้งาน', inactive: 'พักไว้', closed: 'ปิดแล้ว',
}

function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  return `${d}/${mo}/${Number(y) + 543}`
}

function formatTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

export function generateJobCodesListHTML(data: JobCodesListTemplateData): string {
  const logoSrc = companyLogoDataUri(data.company.code)
  const groups  = groupJobs(data.jobs, data.groupBy)
  const total   = data.jobs.length

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>Job Codes ${data.year}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
  .page { width: 297mm; min-height: 210mm; padding: 12mm 14mm; margin: 0 auto; background: #fff; }

  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
  .header-logo { height: 36px; object-fit: contain; }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 { font-size: 14px; font-weight: 700; color: #1e3a8a; }
  .header-center p.meta { font-size: 9px; color: #777; margin-top: 1px; }
  .doc-id { font-size: 9px; color: #888; text-align: right; min-width: 150px; }

  .doc-title { text-align: center; font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 4px; }
  .doc-sub { text-align: center; font-size: 10px; color: #666; margin-bottom: 10px; }

  .summary { display: flex; gap: 24px; justify-content: center; margin-bottom: 10px; padding: 6px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
  .summary div { text-align: center; }
  .summary .label { font-size: 9px; color: #888; }
  .summary .value { font-size: 13px; font-weight: 700; color: #1e3a8a; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; } /* repeat header on each printed page */
  th { font-size: 9.5px; color: #555; font-weight: 600; text-align: left; padding: 4px 6px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; white-space: nowrap; }
  th.num { text-align: right; }
  td { font-size: 10px; padding: 3px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  tr.group-row td { background: #eef2f7; font-weight: 600; color: #475569; font-size: 9.5px; padding: 4px 6px; }
  tr.group-row { break-inside: avoid; }
  tr.job-row { break-inside: avoid; }
  .name-en { color: #888; font-size: 9px; }

  .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #aaa; display: flex; justify-content: space-between; }
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
      <div>วันที่ออกเอกสาร: ${formatThaiDate(data.generated_at.slice(0, 10))}</div>
    </div>
  </div>

  <div class="doc-title">รายการ Job Codes ปี ${data.year}</div>
  <div class="doc-sub">
    จัดกลุ่มตาม${data.groupBy === 'year' ? 'ปี (J-code)' : 'ลูกค้า'}
    ${data.search ? ` · ค้นหา "${data.search}"` : ''}
  </div>

  <div class="summary">
    <div><div class="label">จำนวน Job ทั้งหมด</div><div class="value">${total}</div></div>
    ${data.revenueTotal !== null ? `<div><div class="label">มูลค่างานรวม (ปีนี้)</div><div class="value">${formatTHB(data.revenueTotal)} บาท</div></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th class="num">ลำดับ</th>
        <th>Job Code</th>
        <th>ชื่องาน</th>
        <th>ลูกค้า</th>
        <th>สถานะ</th>
        <th>ระยะเวลา</th>
        <th class="num">มูลค่างาน (บาท)</th>
      </tr>
    </thead>
    <tbody>
      ${groups.map(g => `
        <tr class="group-row"><td colspan="7">${g.key} (${g.jobs.length})</td></tr>
        ${g.jobs.map(job => `
          <tr class="job-row">
            <td class="num">${job.sequence_no ?? '—'}</td>
            <td>${job.job_code}</td>
            <td>${job.name_th}${job.name_en ? `<div class="name-en">${job.name_en}</div>` : ''}</td>
            <td>${job.client_name ?? '—'}</td>
            <td>${STATUS_TH[job.status] ?? job.status}</td>
            <td>${job.start_date || job.end_date ? `${formatThaiDate(job.start_date)} – ${formatThaiDate(job.end_date)}` : '—'}</td>
            <td class="num">${formatTHB(job.contract_value)}</td>
          </tr>
        `).join('')}
      `).join('')}
      ${!total ? `<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">ไม่มี Job</td></tr>` : ''}
    </tbody>
  </table>

  <div class="footer">
    <span>CONNEX · ${data.company.name_th}</span>
    <span>เอกสารนี้สร้างโดยระบบอัตโนมัติ · ${new Date().toLocaleDateString('th-TH')}</span>
  </div>

</div>
</body>
</html>`
}
