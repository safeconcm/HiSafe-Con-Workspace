'use client'
// src/app/access/jobs/import/page.tsx
// Bulk-import Job Codes from CSV/Excel (2026-10-20, "ข้อ 5") — mirrors
// src/app/access/users/import/page.tsx's parse → preview → confirm flow.
import { useState, useRef } from 'react'
import { useImportJobs }    from '@/hooks/useAdmin'
import { cn }               from '@/utils'
import * as XLSX            from 'xlsx'
import {
  Upload, FileText, CheckCircle2, XCircle,
  AlertCircle, ArrowLeft, Loader2, Download,
} from 'lucide-react'
import Link from 'next/link'

const REQUIRED_COLS = ['job_code', 'name_th']
const ALL_COLS = ['job_code', 'name_th', 'name_en', 'client_name', 'description', 'contract_value', 'start_date', 'end_date', 'sequence_no']

// Excel serial date -> 'YYYY-MM-DD' (2026-10-21, date columns added). Excel
// stores dates as a day count from 1899-12-30; this is the standard
// conversion (handles the classic Excel 1900-leap-year quirk the same way
// the SheetJS docs do — good enough for any realistic project date).
function excelSerialToISODate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { headers: [], rows: [] }

  const firstLine = lines[0].replace(/^﻿/, '')
  const headers   = firstLine.split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())

  const rows = lines.slice(1).map(line => {
    const cells: string[] = []
    let cur = '', inQ = false
    for (const ch of line + ',') {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').replace(/^"|"$/g, '').trim() })
    return obj
  })

  return { headers, rows }
}

// Date columns (2026-10-21, "เพิ่ม start date, end date") need special
// handling: an Excel cell formatted as a date comes back from SheetJS
// (with cellDates:true, set below) as a real JS Date object, not text —
// String(cell) on that would print something like
// "Thu Jan 15 2026 00:00:00 GMT+0700 (...)" , not 'YYYY-MM-DD'. A cell typed
// as plain text (someone typed "2026-01-15" directly) stays a string and
// passes through unchanged. Using the cell's UTC getters (not local) avoids
// a timezone-driven day shift on a value that has no time-of-day meaning.
function formatCell(header: string, cell: unknown): string {
  if (cell instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`
  }
  if ((header === 'start_date' || header === 'end_date') && typeof cell === 'number') {
    return excelSerialToISODate(cell)
  }
  return String(cell ?? '').trim()
}

function parseExcel(buffer: ArrayBuffer): { headers: string[]; rows: Record<string, string>[] } {
  const wb    = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { headers: [], rows: [] }

  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
  if (!raw.length) return { headers: [], rows: [] }

  const headers = (raw[0] as any[]).map(h => String(h ?? '').trim().toLowerCase())

  const rows = raw.slice(1)
    .filter(r => Array.isArray(r) && r.some(cell => String(cell ?? '').trim() !== ''))
    .map(r => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = formatCell(h, r[i]) })
      return obj
    })

  return { headers, rows }
}

type ImportResult = {
  success: boolean
  created: number
  updated: number
  skipped: number
  failed: number
  total: number
  errors?: { row: number; error: string }[]
  results?: { row: number; job_code: string; success: boolean; action?: 'created' | 'updated' | 'skipped'; error?: string }[]
}

export default function ImportJobsPage() {
  const fileRef  = useRef<HTMLInputElement>(null)
  const importFn = useImportJobs()
  const now = new Date()
  const [year] = useState(now.getFullYear())

  const [step,    setStep]    = useState<'upload' | 'preview' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows,    setRows]    = useState<Record<string, string>[]>([])
  const [colErrs, setColErrs] = useState<string[]>([])
  const [result,  setResult]  = useState<ImportResult | null>(null)

  const handleFile = (file: File) => {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    const reader   = new FileReader()

    reader.onload = e => {
      const { headers: h, rows: r } = isExcel
        ? parseExcel(e.target?.result as ArrayBuffer)
        : parseCSV(e.target?.result as string)

      setHeaders(h)
      setRows(r)

      const missing = REQUIRED_COLS.filter(c => !h.includes(c))
      setColErrs(missing.length ? [`คอลัมน์ที่ขาด: ${missing.join(', ')}`] : [])
      setStep('preview')
    }

    if (isExcel) reader.readAsArrayBuffer(file)
    else         reader.readAsText(file, 'utf-8')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && /\.(csv|xlsx|xls)$/i.test(file.name)) handleFile(file)
  }

  const handleConfirm = async () => {
    const data = await importFn.mutateAsync({ rows, year })
    setResult(data)
    setStep('done')
  }

  const downloadTemplate = () => {
    const BOM = '﻿'
    const csv = BOM + [ALL_COLS.join(','),
      'JOB101,โครงการก่อสร้าง A,Construction Project A,บริษัท ABC จำกัด,งานสร้างอาคารสำนักงาน,500000,2026-01-15,2026-12-31,1',
      'JOB102,โครงการปรับปรุงอาคาร B,Building Renovation B,บริษัท XYZ จำกัด,,,,,',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'job_codes_import_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-container max-w-4xl space-y-5">

      <div className="flex items-center gap-3">
        <Link href="/access/jobs" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1>นำเข้า Job Codes จาก CSV/Excel</h1>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="card card-body">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">ขั้นตอนการนำเข้า</h3>
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Download className="w-4 h-4" />
                ดาวน์โหลด Template
              </button>
            </div>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal pl-4">
              <li>ดาวน์โหลด Template แล้วกรอกข้อมูล Job Code (แก้ไขเป็นไฟล์ Excel แล้วอัปโหลด .xlsx ได้เลย ไม่ต้องแปลงกลับเป็น CSV)</li>
              <li>คอลัมน์บังคับ: <code className="text-xs bg-gray-100 px-1 rounded">{REQUIRED_COLS.join(', ')}</code></li>
              <li>Job Code ที่นำเข้าจะผูกกับปี {year} (ปีที่เลือกไว้ในหน้า Job Codes)</li>
              <li>ถ้า Job Code ซ้ำกับที่มีอยู่แล้วในปีเดียวกัน จะไม่ถูกปฏิเสธ — ระบบจะ<strong>เติมเฉพาะข้อมูลที่ยังว่างอยู่</strong>ให้ (เช่น มูลค่างาน, วันที่, ลำดับ) ส่วนข้อมูลที่กรอกไว้แล้วจะไม่ถูกเขียนทับ ดังนั้นนำเข้าไฟล์เดิมซ้ำได้อย่างปลอดภัย</li>
              <li>สถานะเริ่มต้นของ Job ที่สร้างใหม่คือ &quot;กำลังดำเนินการ&quot; — ไปปรับเป็นพัก/ปิดได้ทีหลังที่หน้า Job Codes (การนำเข้าจะไม่เปลี่ยนสถานะของ Job ที่มีอยู่แล้ว)</li>
              <li>คอลัมน์ <code className="text-xs bg-gray-100 px-1 rounded">contract_value</code> (มูลค่างาน), <code className="text-xs bg-gray-100 px-1 rounded">start_date</code>/<code className="text-xs bg-gray-100 px-1 rounded">end_date</code> (วันที่เริ่ม/สิ้นสุด แบบ YYYY-MM-DD หรือคอลัมน์วันที่ใน Excel), และ <code className="text-xs bg-gray-100 px-1 rounded">sequence_no</code> (ลำดับ Job) เป็นตัวเลือกทั้งหมด — เว้นว่างได้</li>
              <li>นำเข้าได้สูงสุด 500 รายการต่อครั้ง</li>
            </ol>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">คลิกหรือลากไฟล์ CSV หรือ Excel มาวางที่นี่</p>
            <p className="text-xs text-gray-400 mt-1">รองรับ .csv, .xlsx, .xls</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {colErrs.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-1">
                <XCircle className="w-4 h-4" />
                ไฟล์ไม่ถูกต้อง
              </div>
              {colErrs.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          <div className="card card-body">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                <FileText className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Preview — {rows.length} รายการ (ปี {year})
              </h3>
              <button onClick={() => setStep('upload')} className="text-xs text-gray-500 hover:underline">
                เลือกไฟล์ใหม่
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    {ALL_COLS.filter(c => headers.includes(c)).map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {ALL_COLS.filter(c => headers.includes(c)).map(c => (
                        <td key={c} className="text-gray-700">{row[c] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && (
              <p className="text-xs text-gray-400 mt-2">แสดง 10 จาก {rows.length} รายการ</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              disabled={colErrs.length > 0 || importFn.isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {importFn.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              ยืนยันนำเข้า {rows.length} รายการ
            </button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className={cn(
            'card card-body',
            (result.failed ?? 0) === 0 && !result.errors?.length ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
          )}>
            <div className="flex items-center gap-3 mb-3">
              {(result.failed ?? 0) === 0 && !result.errors?.length
                ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                : <AlertCircle className="w-6 h-6 text-amber-600" />
              }
              <h3 className="text-sm font-semibold text-gray-900">
                นำเข้าเสร็จสิ้น — {result.total ?? rows.length} รายการ
              </h3>
            </div>

            {!result.errors?.length && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-1">
                <span>สร้างใหม่ <strong className="text-gray-900">{result.created}</strong></span>
                <span>เติมข้อมูลที่ขาด <strong className="text-gray-900">{result.updated}</strong></span>
                <span>ข้อมูลครบอยู่แล้ว (ไม่เปลี่ยนแปลง) <strong className="text-gray-900">{result.skipped}</strong></span>
                {(result.failed ?? 0) > 0 && <span className="text-red-600">ล้มเหลว <strong>{result.failed}</strong></span>}
              </div>
            )}

            {!!result.errors?.length && (
              <div className="mt-1 space-y-1">
                <p className="text-xs font-medium text-red-700">
                  ไฟล์ไม่ผ่านการตรวจสอบ ({result.errors.length} รายการ) — ยังไม่มีการนำเข้าข้อมูลใดๆ กรุณาแก้ไขแล้วลองใหม่:
                </p>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">• แถว {e.row}: {e.error}</p>
                  ))}
                </div>
              </div>
            )}

            {!result.errors?.length && (result.failed ?? 0) > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-red-700">รายการที่ล้มเหลว:</p>
                {result.results?.filter(r => !r.success).map((r, i) => (
                  <p key={i} className="text-xs text-red-600">• แถว {r.row} ({r.job_code}): {r.error}</p>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); setResult(null); setRows([]) }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              นำเข้าเพิ่มเติม
            </button>
            <Link href="/access/jobs"
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 text-center">
              ดู Job Codes
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
