// src/app/api/export/route.ts
// GET /api/export?type=leave|timesheet|ot|users|salary|contracts&format=xlsx|csv
// Generates Excel (.xlsx) or CSV exports for HR

import { NextRequest, NextResponse } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  unauthorized, forbidden, badRequest, serverError, isHROrAdmin,
} from '@/lib/api-helpers'

// Pre-compute CRC32 table once at module level
const CRC32_TABLE = (() => {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32Global(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// Simple XLSX builder — no npm package needed
function buildXLSX(headers: string[], rows: (string|number|null)[][]): Buffer {
  const xmlRows = [headers, ...rows].map((row, ri) => {
    const cells = row.map((val, ci) => {
      const colLetter = String.fromCharCode(65 + ci)
      const cellRef   = `${colLetter}${ri + 1}`
      if (val === null || val === undefined) return `<c r="${cellRef}"/>`
      if (typeof val === 'number') return `<c r="${cellRef}" t="n"><v>${val}</v></c>`
      // String — use shared strings index workaround: inline string
      const escaped = String(val)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      return `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`
    }).join('')
    return `<row r="${ri + 1}">${cells}</row>`
  }).join('')

  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${xmlRows}</sheetData>
</worksheet>`

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml"  ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const _rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  // Build ZIP manually (XLSX = ZIP)
  function zipEntry(name: string, data: Buffer): Buffer {
    const nameBytes  = Buffer.from(name, 'utf8')
    const crc        = crc32Global(data)
    const compressed = data // Store uncompressed (method=0) for simplicity
    const local = Buffer.alloc(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50, 0)  // signature
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0, 6)           // flags
    local.writeUInt16LE(0, 8)           // compression (store)
    local.writeUInt16LE(0, 10)          // mod time
    local.writeUInt16LE(0, 12)          // mod date
    local.writeUInt32LE(crc, 14)        // crc32
    local.writeUInt32LE(data.length, 18) // compressed size
    local.writeUInt32LE(data.length, 22) // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26) // filename length
    local.writeUInt16LE(0, 28)          // extra length
    nameBytes.copy(local, 30)
    return Buffer.concat([local, compressed])
  }


  const files: { name: string; data: Buffer; offset: number }[] = []
  let offset = 0

  function addFile(name: string, content: string) {
    const data  = Buffer.from(content, 'utf8')
    const entry = zipEntry(name, data)
    files.push({ name, data, offset })
    offset += entry.length
    return entry
  }

  const parts: Buffer[] = [
    addFile('[Content_Types].xml', contentTypes),
    addFile('_rels/.rels', _rels),
    addFile('xl/workbook.xml', workbook),
    addFile('xl/_rels/workbook.xml.rels', rels),
    addFile('xl/worksheets/sheet1.xml', sheet),
  ]

  // Central directory
  const cdEntries = files.map(({ name, data, offset: off }) => {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32Global(data)
    const cd = Buffer.alloc(46 + nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38); cd.writeUInt32LE(off, 42)
    nameBytes.copy(cd, 46)
    return cd
  })

  const cdSize   = cdEntries.reduce((s, b) => s + b.length, 0)
  const cdOffset = offset
  const eocd     = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, ...cdEntries, eocd])
}

function buildCSV(headers: string[], rows: (string|number|null)[][]): string {
  const BOM = '\uFEFF'
  const all  = [headers, ...rows]
  return BOM + all.map(row =>
    row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const type   = searchParams.get('type')   ?? 'leave'
  const format = searchParams.get('format') ?? 'xlsx'
  const year   = searchParams.get('year')   ?? String(new Date().getFullYear())
  const month  = searchParams.get('month')
  const status = searchParams.get('status')

  if (!['xlsx','csv'].includes(format)) return badRequest('format must be xlsx or csv')

  const supabase = createAdminSupabaseClient()
  let headers: string[] = []
  let rows: (string|number|null)[][] = []
  let filename = `${type}-${year}`
  if (month) filename += `-${String(month).padStart(2,'0')}`

  // ── Leave ─────────────────────────────────────────────────
  if (type === 'leave') {
    let q = supabase.from('leave_requests')
      .select(`*, user:users!leave_requests_user_id_fkey(
        employee_code, first_name_th, last_name_th, department, position_th
      )`)
      .eq('company_id', session.company_id)
      .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
      .order('start_date').limit(5000)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return serverError(error)

    const typeMap: Record<string,string> = { annual:'พักร้อน', sick:'ป่วย', personal:'กิจ', maternity:'คลอด', other:'อื่นๆ' }
    const statMap: Record<string,string> = { pending:'รออนุมัติ', approved:'อนุมัติ', rejected:'ไม่อนุมัติ', cancelled:'ยกเลิก' }

    headers = ['รหัสพนักงาน','ชื่อ-สกุล','แผนก','ประเภทลา','วันที่เริ่ม','วันที่สิ้นสุด','จำนวนวัน','สถานะ','เหตุผล']
    rows = (data ?? []).map((r: any) => [
      r.user?.employee_code ?? '',
      `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
      r.user?.department ?? '',
      typeMap[r.leave_type] ?? r.leave_type,
      r.start_date, r.end_date, r.total_days,
      statMap[r.status] ?? r.status,
      r.reason ?? '',
    ])
  }

  // ── Timesheet ─────────────────────────────────────────────
  else if (type === 'timesheet') {
    let q = supabase.from('timesheets')
      .select(`*, user:users!timesheets_user_id_fkey(
        employee_code, first_name_th, last_name_th, department
      )`)
      .eq('company_id', session.company_id)
      .eq('year', parseInt(year))
      .order('month').limit(5000)
    if (month) q = q.eq('month', parseInt(month))
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return serverError(error)

    headers = ['รหัสพนักงาน','ชื่อ-สกุล','แผนก','ปี','เดือน','ชั่วโมง','สถานะ']
    rows = (data ?? []).map((r: any) => [
      r.user?.employee_code ?? '',
      `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
      r.user?.department ?? '',
      r.year, r.month, r.total_hours, r.status,
    ])
  }

  // ── OT ───────────────────────────────────────────────────
  else if (type === 'ot') {
    let q = supabase.from('ot_requests')
      .select(`*, user:users!ot_requests_user_id_fkey(
        employee_code, first_name_th, last_name_th, department
      ), job:jobs(job_code, name_th)`)
      .eq('company_id', session.company_id)
      .gte('ot_date', `${year}-01-01`).lte('ot_date', `${year}-12-31`)
      .order('ot_date').limit(5000)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return serverError(error)

    const otTypeMap: Record<string,string> = { weekday:'วันธรรมดา', weekend:'เสาร์-อาทิตย์', holiday:'วันหยุด' }
    headers = ['รหัสพนักงาน','ชื่อ-สกุล','แผนก','วันที่','ประเภท','เริ่ม','สิ้นสุด','ชั่วโมง','Job Code','สถานะ']
    rows = (data ?? []).map((r: any) => [
      r.user?.employee_code ?? '',
      `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
      r.user?.department ?? '',
      r.ot_date, otTypeMap[r.ot_type] ?? r.ot_type,
      r.start_time, r.end_time, r.total_hours,
      (r.job as any)?.job_code ?? '', r.status,
    ])
  }

  // ── Users (HR roster) ────────────────────────────────────
  else if (type === 'users') {
    const { data, error } = await supabase.from('users')
      .select('employee_code,first_name_th,last_name_th,first_name_en,last_name_en,email,phone,department,position_th,role,status,hire_date,resign_date')
      .eq('company_id', session.company_id)
      .order('employee_code').limit(5000)
    if (error) return serverError(error)

    const roleMap: Record<string,string> = { employee:'พนักงาน', supervisor:'หัวหน้า', hr:'HR', admin:'Admin' }
    const statMap: Record<string,string> = { active:'ทำงาน', inactive:'ระงับ', resigned:'ลาออก' }
    headers = ['รหัสพนักงาน','ชื่อ','นามสกุล','ชื่อ EN','นามสกุล EN','อีเมล','โทร','แผนก','ตำแหน่ง','Role','สถานะ','วันเริ่มงาน','วันลาออก']
    rows = (data ?? []).map((r: any) => [
      r.employee_code, r.first_name_th, r.last_name_th,
      r.first_name_en ?? '', r.last_name_en ?? '',
      r.email, r.phone ?? '', r.department ?? '', r.position_th ?? '',
      roleMap[r.role] ?? r.role, statMap[r.status] ?? r.status,
      r.hire_date, r.resign_date ?? '',
    ])
  }

  // ── Salary ───────────────────────────────────────────────
  else if (type === 'salary') {
    let q = supabase.from('salary_records')
      .select(`*, user:users!salary_records_user_id_fkey(
        employee_code, first_name_th, last_name_th, department
      )`)
      .eq('company_id', session.company_id)
      .gte('effective_date', `${year}-01-01`).lte('effective_date', `${year}-12-31`)
      .order('effective_date').limit(5000)
    const { data, error } = await q
    if (error) return serverError(error)

    headers = ['รหัสพนักงาน','ชื่อ-สกุล','แผนก','วันที่มีผล','เงินเดือนฐาน','เงินสุทธิ','เหตุผล']
    rows = (data ?? []).map((r: any) => [
      r.user?.employee_code ?? '',
      `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
      r.user?.department ?? '',
      r.effective_date, r.base_salary, r.net_salary ?? '', r.reason ?? '',
    ])
  }

  // ── Contracts ────────────────────────────────────────────
  else if (type === 'contracts') {
    const { data, error } = await supabase.from('contracts')
      .select(`*, user:users!contracts_user_id_fkey(
        employee_code, first_name_th, last_name_th, department, position_th
      )`)
      .eq('company_id', session.company_id)
      .order('start_date', { ascending: false }).limit(5000)
    if (error) return serverError(error)

    const typeMap: Record<string,string> = {
      permanent:'ถาวร', fixed_term:'สัญญาจ้าง', part_time:'พาร์ทไทม์', intern:'ฝึกงาน', outsource:'เอาท์ซอร์ส',
    }
    const statMap: Record<string,string> = { draft:'ร่าง', active:'มีผล', expired:'หมดอายุ', terminated:'สิ้นสุด' }
    headers = ['เลขที่สัญญา','รหัสพนักงาน','ชื่อ-สกุล','แผนก','ตำแหน่ง','ประเภท','วันเริ่ม','วันสิ้นสุด','เงินเดือน','สถานะ']
    rows = (data ?? []).map((r: any) => [
      r.contract_no,
      r.user?.employee_code ?? '',
      `${r.user?.first_name_th ?? ''} ${r.user?.last_name_th ?? ''}`.trim(),
      r.user?.department ?? '', r.user?.position_th ?? '',
      typeMap[r.contract_type] ?? r.contract_type,
      r.start_date, r.end_date ?? '', r.base_salary,
      statMap[r.status] ?? r.status,
    ])
  }

  else {
    return badRequest(`Unknown export type: ${type}`)
  }

  if (format === 'xlsx') {
    const buf = buildXLSX(headers, rows)
    // Convert Node Buffer to ArrayBuffer for NextResponse
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return new NextResponse(arrayBuf as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    })
  } else {
    const csv = buildCSV(headers, rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }
}
