'use client'
// src/app/(dashboard)/hr/salary/import/page.tsx
// Bulk-submit salary adjustments from CSV/Excel (2026-10-20, "ข้อ 2": year-
// end raises for many employees at once) — mirrors
// src/app/access/jobs/import/page.tsx's parse → preview → confirm flow.
// Every row lands as a 'pending' salary_records row, same as the one-by-one
// form — still needs Admin/MD approval at /hr/salary before it affects pay.
import { useState, useRef } from 'react'
import { useQueryClient }   from '@tanstack/react-query'
import { cn }               from '@/utils'
import * as XLSX            from 'xlsx'
import {
  Upload, FileText, CheckCircle2, XCircle,
  AlertCircle, ArrowLeft, Loader2, Download,
} from 'lucide-react'
import Link from 'next/link'

const REQUIRED_COLS = ['employee_code', 'effective_date', 'base_salary']
const ALL_COLS = ['employee_code', 'effective_date', 'base_salary', 'reason']

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

function formatDateYMD(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
      headers.forEach((h, i) => {
        const cell = r[i]
        if (cell instanceof Date) obj[h] = formatDateYMD(cell)
        else if (cell === undefined || cell === null) obj[h] = ''
        else obj[h] = String(cell).trim()
      })
      return obj
    })
  return { headers, rows }
}

type ImportResult = {
  success: boolean; created: number; failed: number; total: number
  errors?: { row: number; error: string }[]
}

export default function ImportSalaryPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const [step,    setStep]    = useState<'upload' | 'preview' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows,    setRows]    = useState<Record<string, string>[]>([])
  const [colErrs, setColErrs] = useState<string[]>([])
  const [result,  setResult]  = useState<ImportResult | null>(null)
  const [pending, setPending] = useState(false)

  const handleFile = (file: File) => {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    const reader = new FileReader()
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
    else reader.readAsText(file, 'utf-8')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && /\.(csv|xlsx|xls)$/i.test(file.name)) handleFile(file)
  }

  const handleConfirm = async () => {
    setPending(true)
    try {
      const res  = await fetch('/api/hr/salary/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResult(json.data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['salary'] })
    } catch (e: any) {
      setResult({ success: false, created: 0, failed: rows.length, total: rows.length, errors: [{ row: 0, error: e.message }] })
      setStep('done')
    } finally {
      setPending(false)
    }
  }

  const downloadTemplate = () => {
    const BOM = '﻿'
    const csv = BOM + [ALL_COLS.join(','),
      'SC-001,2027-01-01,28000,ปรับเงินเดือนประจำปี 2027',
      'SC-002,2027-01-01,22000,',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'salary_adjustment_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-container max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/hr/salary" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1>นำเข้าปรับเงินเดือนจาก CSV/Excel</h1>
      </div>

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="card card-body">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">ขั้นตอนการนำเข้า</h3>
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Download className="w-4 h-4" />ดาวน์โหลด Template
              </button>
            </div>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal pl-4">
              <li>ดาวน์โหลด Template แล้วกรอกเงินเดือนใหม่ของแต่ละคน (แก้เป็น Excel แล้วอัปโหลด .xlsx ได้เลย)</li>
              <li>คอลัมน์บังคับ: <code className="text-xs bg-gray-100 px-1 rounded">{REQUIRED_COLS.join(', ')}</code> — employee_code ต้องมีอยู่แล้วในระบบของบริษัทนี้</li>
              <li>ทุกแถวที่นำเข้าจะมีสถานะ &quot;รออนุมัติ&quot; — ต้องให้ Admin หรือ MD กดอนุมัติที่หน้า &quot;ประวัติเงินเดือน&quot; ก่อน จึงจะมีผลกับ Payroll/Job Cost จริง</li>
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
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          {colErrs.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-1">
                <XCircle className="w-4 h-4" />ไฟล์ไม่ถูกต้อง
              </div>
              {colErrs.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}
          <div className="card card-body">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                <FileText className="w-4 h-4 inline mr-1.5 text-gray-400" />Preview — {rows.length} รายการ
              </h3>
              <button onClick={() => setStep('upload')} className="text-xs text-gray-500 hover:underline">เลือกไฟล์ใหม่</button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead><tr>{ALL_COLS.filter(c => headers.includes(c)).map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>{ALL_COLS.filter(c => headers.includes(c)).map(c => <td key={c} className="text-gray-700">{row[c] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && <p className="text-xs text-gray-400 mt-2">แสดง 10 จาก {rows.length} รายการ</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('upload')}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button onClick={handleConfirm} disabled={colErrs.length > 0 || pending}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              ส่งขออนุมัติ {rows.length} รายการ
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className={cn('card card-body', result.created > 0 && result.created === result.total ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50')}>
            <div className="flex items-center gap-3 mb-3">
              {result.created > 0 && result.created === result.total
                ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                : <AlertCircle className="w-6 h-6 text-amber-600" />}
              <h3 className="text-sm font-semibold text-gray-900">
                ส่งขออนุมัติแล้ว — สำเร็จ {result.created} / {result.total ?? rows.length} รายการ
              </h3>
            </div>
            {!!result.errors?.length && (
              <div className="mt-1 space-y-1">
                <p className="text-xs font-medium text-red-700">ไฟล์ไม่ผ่านการตรวจสอบ ({result.errors.length} รายการ):</p>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">• แถว {e.row}: {e.error}</p>)}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); setResult(null); setRows([]) }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">นำเข้าเพิ่มเติม</button>
            <Link href="/hr/salary" className="flex-1 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800 text-center">
              ไปหน้าอนุมัติ
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
