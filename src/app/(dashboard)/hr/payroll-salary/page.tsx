'use client'
// src/app/(dashboard)/hr/payroll-salary/page.tsx
// "ปิดเงินเดือนประจำเดือน (Staff)" (2026-10-16) — the actual monthly payroll
// run for salaried employees, deliberately separate from /payroll per
// request: "ต้องแยก Payroll กับ Timesheet เพราะ Timesheet payroll จะเอา
// คำนวณเงินลง job cost ตาม Job". /payroll (src/lib/payroll.ts) answers
// "how much labor cost to allocate to which Job Code" and only lists people
// who submitted an approved Timesheet that month — salaried staff who don't
// track hours against Job Codes never show up there at all. This page
// answers the different question HR actually has every month: "what do I
// pay this person, and is there anything to deduct" — for every active
// employee, Timesheet or not.
//
// Backed by the existing /api/hr/payroll-salary (roster + suggested
// deductions) and the existing /api/hr/salary POST (saves the record) — no
// new database table. A saved month is treated as closed/final, same as
// every other record in "ประวัติเงินเดือน" (/hr/salary) — there's no edit
// anywhere in that log by design, matching how a real payslip, once issued,
// isn't silently rewritten; a correction would be a new dated entry instead.
import { useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { cn } from '@/utils'
import { Banknote, Loader2, ChevronLeft, ChevronRight, Plus, X, CheckCircle2, AlertTriangle, BarChart3 } from 'lucide-react'

const MONTH_LABEL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// Yearly summary (2026-10-16, per request: "ต้อง...summary รายเดือน รายปี")
// fetches all 12 months of the existing roster endpoint in parallel and
// sums each month's already-closed records client-side — reuses
// /api/hr/payroll-salary as-is rather than adding a new backend aggregation
// endpoint, since this is only ever fetched on demand (toggled open), not
// on every page load.
function YearlySummary({ year }: { year: number }) {
  const queries = useQueries({
    queries: Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
      queryKey: ['payroll-salary', year, m],
      queryFn: async () => {
        const res  = await fetch(`/api/hr/payroll-salary?year=${year}&month=${m}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลไม่สำเร็จ')
        return json.data
      },
    })),
  })

  const loading = queries.some(q => q.isLoading)
  const monthTotals = queries.map((q, i) => {
    const rows: RosterRow[] = q.data?.rows ?? []
    const closedRows = rows.filter(r => r.existing)
    const total = closedRows.reduce((s, r) => s + Number(r.existing!.net_salary ?? r.existing!.base_salary), 0)
    return { month: i + 1, closedCount: closedRows.length, total }
  })
  const yearTotal = monthTotals.reduce((s, m) => s + m.total, 0)

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr><th>เดือน</th><th className="text-right">จำนวนคนที่ปิดแล้ว</th><th className="text-right">ยอดรวม</th></tr>
        </thead>
        <tbody>
          {monthTotals.map(m => (
            <tr key={m.month}>
              <td className="text-sm text-gray-700">{MONTH_LABEL[m.month]} {year + 543}</td>
              <td className="text-right text-sm text-gray-600">{m.closedCount} คน</td>
              <td className="text-right text-sm font-medium text-gray-900">{m.total.toLocaleString('th-TH')} ฿</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-body flex items-center justify-between border-t border-gray-100">
        <span className="text-sm font-medium text-gray-700">รวมทั้งปี {year + 543}</span>
        <span className="text-base font-semibold text-gray-900">{yearTotal.toLocaleString('th-TH')} ฿</span>
      </div>
    </div>
  )
}

type DeductionRow = { label: string; amount: string }

type RosterRow = {
  user_id: string
  employee_code: string
  name: string
  department: string | null
  position_th: string | null
  salary_type: string
  base_salary: number
  daily_rate: number
  unpaid_leave_days: number
  suggested_deduction: number
  existing: { id: string; base_salary: number; deductions: Record<string, number> | null; net_salary: number | null; notes: string | null; created_at: string } | null
}

export default function PayrollSalaryPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [showYearly, setShowYearly] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-salary', year, month],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/payroll-salary?year=${year}&month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลไม่สำเร็จ')
      return json.data
    },
  })

  const rows: RosterRow[] = data?.rows ?? []

  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ } else if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y); setOpenUserId(null)
  }

  const closedRows = rows.filter(r => r.existing)
  const monthTotal = closedRows.reduce((s, r) => s + Number(r.existing!.net_salary ?? r.existing!.base_salary), 0)

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-gray-500" />
          <h1>Payroll พนักงานประจำ (Staff)</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowYearly(v => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              showYearly ? 'bg-blue-700 border-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            <BarChart3 className="w-4 h-4" /> สรุปรายปี
          </button>
          {!showYearly && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <button onClick={() => shiftMonth(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-gray-700 w-24 text-center">{MONTH_LABEL[month]} {year + 543}</span>
              <button onClick={() => shiftMonth(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          {showYearly && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <button onClick={() => setYear(y => y - 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-gray-700 w-20 text-center">ปี {year + 543}</span>
              <button onClick={() => setYear(y => y + 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        รายการนี้คือ Payroll เงินเดือนที่จ่ายจริงของพนักงานประจำ แยกจากหน้า{' '}
        <a href="/payroll" className="text-blue-700 hover:underline">ต้นทุนแรงงานตาม Job (Job Direct Cost)</a>{' '}
        ซึ่งใช้คำนวณต้นทุนแรงงานลงแต่ละ Job Code เท่านั้น ไม่ใช่ยอดจ่ายจริง
      </p>

      {showYearly ? (
        <YearlySummary year={year} />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-3">
          {!!rows.length && (
            <div className="card card-body flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                ปิดแล้ว {closedRows.length}/{rows.length} คน · เดือน {MONTH_LABEL[month]} {year + 543}
              </span>
              <span className="text-base font-semibold text-gray-900">{monthTotal.toLocaleString('th-TH')} ฿</span>
            </div>
          )}
          {rows.map((r) => (
            <PayrollRow
              key={r.user_id}
              row={r}
              year={year}
              month={month}
              open={openUserId === r.user_id}
              onToggle={() => setOpenUserId(prev => prev === r.user_id ? null : r.user_id)}
              onSaved={() => { qc.invalidateQueries({ queryKey: ['payroll-salary'] }); setOpenUserId(null) }}
            />
          ))}
          {!rows.length && (
            <div className="card card-body text-center py-12 text-gray-400 text-sm">ไม่มีพนักงานที่ทำงานอยู่</div>
          )}
        </div>
      )}
    </div>
  )
}

function PayrollRow({
  row, year, month, open, onToggle, onSaved,
}: {
  row: RosterRow
  year: number
  month: number
  open: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  const closed = !!row.existing

  const [baseSalary, setBaseSalary] = useState(String(row.base_salary))
  const [notes, setNotes] = useState('')
  const [deductions, setDeductions] = useState<DeductionRow[]>(
    row.suggested_deduction > 0
      ? [{ label: `ลาไม่รับค่าจ้าง ${row.unpaid_leave_days} วัน`, amount: String(row.suggested_deduction) }]
      : []
  )

  const totalDeduction = deductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  const netPay = (parseFloat(baseSalary) || 0) - totalDeduction

  const save = useMutation({
    mutationFn: async () => {
      const deductionsObj: Record<string, number> = {}
      for (const d of deductions) {
        if (d.label.trim() && parseFloat(d.amount) > 0) deductionsObj[d.label.trim()] = parseFloat(d.amount)
      }
      const res = await fetch('/api/hr/salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: row.user_id,
          effective_date: `${year}-${String(month).padStart(2, '0')}-01`,
          base_salary: parseFloat(baseSalary),
          deductions: deductionsObj,
          notes: notes.trim() || null,
          reason: `เงินเดือนประจำเดือน ${MONTH_LABEL_FULL[month]} ${year + 543}`,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      toast.success('บันทึกเงินเดือนประจำเดือนแล้ว')
      onSaved()
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  const addDeductionRow = () => setDeductions(d => [...d, { label: '', amount: '' }])
  const updateDeductionRow = (i: number, patch: Partial<DeductionRow>) =>
    setDeductions(d => d.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  const removeDeductionRow = (i: number) => setDeductions(d => d.filter((_, idx) => idx !== i))

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{row.name}</p>
            <span className="text-xs text-gray-400">{row.employee_code}</span>
            {row.unpaid_leave_days > 0 && !closed && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" /> ลาไม่รับค่าจ้าง {row.unpaid_leave_days} วัน
              </span>
            )}
            {closed && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> บันทึกแล้ว
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{row.department ?? '—'} · {row.position_th ?? ''}</p>
        </div>
        <p className="text-sm font-semibold text-gray-900 shrink-0">
          {(closed ? Number(row.existing!.net_salary ?? row.existing!.base_salary) : row.base_salary).toLocaleString('th-TH')} ฿
        </p>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {closed ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">เงินเดือนฐาน: <span className="font-medium text-gray-900">{Number(row.existing!.base_salary).toLocaleString('th-TH')} ฿</span></p>
              {row.existing!.deductions && Object.keys(row.existing!.deductions).length > 0 && (
                <div className="space-y-1">
                  <p className="text-gray-600">รายการหัก:</p>
                  {Object.entries(row.existing!.deductions).map(([label, amount]) => (
                    <p key={label} className="text-red-600 text-xs pl-3">- {label}: {Number(amount).toLocaleString('th-TH')} ฿</p>
                  ))}
                </div>
              )}
              {row.existing!.notes && <p className="text-gray-500 text-xs">หมายเหตุ: {row.existing!.notes}</p>}
              <p className="text-gray-900 font-semibold pt-1">ยอดสุทธิ: {Number(row.existing!.net_salary ?? row.existing!.base_salary).toLocaleString('th-TH')} ฿</p>
              <p className="text-xs text-gray-400">บันทึกแล้วเมื่อเดือนนี้ — หากต้องแก้ไข ให้บันทึกรายการใหม่ผ่าน “ประวัติเงินเดือน” แทน</p>
            </div>
          ) : (
            <>
              <div>
                <label className="form-label">เงินเดือนฐาน (บาท)</label>
                <input
                  type="number" value={baseSalary} min={0} step={100}
                  onChange={e => setBaseSalary(e.target.value)}
                  className="form-input max-w-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="form-label mb-0">รายการหักเงิน (ถ้ามี)</label>
                  <button type="button" onClick={addDeductionRow} className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
                  </button>
                </div>
                {deductions.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">ไม่มีรายการหักเงินเดือนนี้</p>
                )}
                <div className="space-y-2 mt-2">
                  {deductions.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={d.label} onChange={e => updateDeductionRow(i, { label: e.target.value })}
                        placeholder="เหตุผล เช่น ลาเกินสิทธิ์" className="form-input flex-1 text-sm"
                      />
                      <input
                        type="number" value={d.amount} min={0} step={10}
                        onChange={e => updateDeductionRow(i, { amount: e.target.value })}
                        placeholder="บาท" className="form-input w-28 text-sm"
                      />
                      <button type="button" onClick={() => removeDeductionRow(i)} className="p-1.5 text-gray-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">หมายเหตุ</label>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)}
                  rows={2} className="form-input resize-none" placeholder="บันทึกเพิ่มเติม (ถ้ามี)"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                <span className="text-sm text-gray-600">ยอดสุทธิ</span>
                <span className={cn('text-base font-semibold', netPay < 0 ? 'text-red-600' : 'text-gray-900')}>
                  {netPay.toLocaleString('th-TH')} ฿
                </span>
              </div>

              <div className="flex gap-3">
                <button onClick={onToggle} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  ยกเลิก
                </button>
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !baseSalary}
                  className="rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
                >
                  {save.isPending ? 'กำลังบันทึก...' : 'บันทึกเงินเดือนเดือนนี้'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const MONTH_LABEL_FULL = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
