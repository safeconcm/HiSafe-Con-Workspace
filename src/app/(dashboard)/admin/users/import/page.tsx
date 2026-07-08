'use client'
// src/app/(dashboard)/admin/users/import/page.tsx
// Parse CSV file client-side → preview → confirm → POST to API

import { useState, useRef } from 'react'
import { useRouter }        from 'next/navigation'
import { useImportUsers }   from '@/hooks/useAdmin'
import { cn }               from '@/utils'
import * as XLSX            from 'xlsx'
import {
  Upload, FileText, CheckCircle2, XCircle,
  AlertCircle, ArrowLeft, Loader2, Download,
} from 'lucide-react'
import Link from 'next/link'

const REQUIRED_COLS = ['company_code', 'employee_code', 'email', 'first_name_th', 'last_name_th', 'hire_date']
const ALL_COLS = [
  'company_code','employee_code','email','first_name_th','last_name_th',
  'first_name_en','last_name_en','position_th','position_en','department',
  'role','hire_date','phone','annual_leave_balance','sick_leave_balance','personal_leave_balance',
]

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { headers: [], rows: [] }

  // Handle BOM
  const firstLine = lines[0].replace(/^\uFEFF/, '')
  const headers   = firstLine.split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())

  const rows = lines.slice(1).map(line => {
    // Simple CSV parse (handles quoted fields)
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

/** Format a JS Date as YYYY-MM-DD regardless of the workbook's locale/display format. */
function formatDateYMD(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse an .xlsx / .xls workbook (first sheet) into the same row shape as parseCSV. */
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
      headers.forEach((h, i) => {
        const cell = r[i]
        if (cell instanceof Date)       obj[h] = formatDateYMD(cell)
        else if (cell === undefined || cell === null) obj[h] = ''
        else                             obj[h] = String(cell).trim()
      })
      return obj
    })

  return { headers, rows }
}

type ImportResult = {
  success: boolean
  created: number
  failed: number
  total: number
  errors?: { row: number; error: string }[]
  results?: { row: number; employee_code: string; success: boolean; error?: string }[]
}

export default function ImportUsersPage() {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)
  const importFn = useImportUsers()

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
    const data = await importFn.mutateAsync(rows)
    setResult(data)
    setStep('done')
  }

  const downloadTemplate = () => {
    const BOM = '\uFEFF'
    const csv = BOM + [ALL_COLS.join(','),
      'SAFECON,SC-001,somchai@safecon.co.th,สมชาย,ใจดี,Somchai,Jaidee,วิศวกร,Engineer,Engineering,employee,2022-01-01,0812345678,8,28,4',
      'HIGHCON,HC-001,somsri@highcon.co.th,สมศรี,มีสุข,Somsri,Meesuk,ธุรการ,Admin,Administration,employee,2023-03-15,0898765432,8,28,4',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'employee_import_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-container max-w-4xl space-y-5">

      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1>นำเข้าพนักงานจาก CSV</h1>
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
              <li>ดาวน์โหลด Template แล้วกรอกข้อมูลพนักงาน (แก้ไขเป็นไฟล์ Excel แล้วอัปโหลด .xlsx ได้เลย ไม่ต้องแปลงกลับเป็น CSV)</li>
              <li>คอลัมน์บังคับ: <code className="text-xs bg-gray-100 px-1 rounded">{REQUIRED_COLS.join(', ')}</code></li>
              <li>company_code: SAFECON หรือ HIGHCON — ใส่ต่อแถวได้ นำเข้าทั้ง 2 บริษัทพร้อมกันในไฟล์เดียวได้</li>
              <li>วันที่ใช้รูปแบบ YYYY-MM-DD เช่น 2022-01-15 (รองรับ D/M/YYYY เช่น 26/6/2026 ด้วย — ถ้าอัปโหลดจาก Excel และคอลัมน์เป็นชนิดวันที่ ระบบแปลงให้อัตโนมัติ)</li>
              <li>role: employee/พนักงาน, supervisor/หัวหน้างาน, hr/ฝ่ายบุคคล, admin/ผู้ดูแลระบบ (พิมพ์ไทยหรืออังกฤษก็ได้ ไม่กรอก = employee)</li>
              <li>นำเข้าได้สูงสุด 500 รายการต่อครั้ง</li>
            </ol>
          </div>

          {/* Drop zone */}
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
                Preview — {rows.length} รายการ
              </h3>
              <button onClick={() => setStep('upload')} className="text-xs text-gray-500 hover:underline">
                เลือกไฟล์ใหม่
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    {ALL_COLS.filter(c => headers.includes(c)).map(h => (
                      <th key={h}>{h}</th>
                    ))}
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
            result.created > 0 && result.created === result.total ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
          )}>
            <div className="flex items-center gap-3 mb-3">
              {result.created > 0 && result.created === result.total
                ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                : <AlertCircle className="w-6 h-6 text-amber-600" />
              }
              <h3 className="text-sm font-semibold text-gray-900">
                นำเข้าเสร็จสิ้น — สำเร็จ {result.created} / {result.total ?? rows.length} รายการ
              </h3>
            </div>

            {/* Validation errors — file rejected before any row was created */}
            {!!result.errors?.length && (
              <div className="mt-1 space-y-1">
                <p className="text-xs font-medium text-red-700">
                  ไฟล์ไม่ผ่านการตรวจสอบ ({result.errors.length} รายการ) — ยังไม่มีการนำเข้าข้อมูลใดๆ กรุณาแก้ไขแล้วลองใหม่:
                </p>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      • แถว {e.row}: {e.error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Per-row creation errors — file passed validation but some rows failed at create time */}
            {!result.errors?.length && (result.failed ?? 0) > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-red-700">รายการที่ล้มเหลว:</p>
                {result.results?.filter(r => !r.success).map((r, i) => (
                  <p key={i} className="text-xs text-red-600">
                    • แถว {r.row} ({r.employee_code}): {r.error}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); setResult(null); setRows([]) }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              นำเข้าเพิ่มเติม
            </button>
            <Link href="/admin/users"
              className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 text-center">
              ดูรายชื่อผู้ใช้
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
