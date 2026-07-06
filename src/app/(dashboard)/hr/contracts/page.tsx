'use client'
// src/app/(dashboard)/hr/contracts/page.tsx
import { useState }   from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }      from '@/components/ui/Toaster'
import { cn, fullNameTH } from '@/utils'
import { FileText, Plus, Download, Loader2, Search, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const TYPE_LABEL: Record<string,string> = {
  permanent:'ถาวร', fixed_term:'สัญญาจ้าง', part_time:'พาร์ทไทม์',
  intern:'ฝึกงาน', outsource:'เอาท์ซอร์ส',
}
const STATUS_COLOR: Record<string,string> = {
  draft:'bg-gray-100 text-gray-500', active:'bg-green-100 text-green-700',
  expired:'bg-amber-100 text-amber-700', terminated:'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string,string> = {
  draft:'ร่าง', active:'มีผล', expired:'หมดอายุ', terminated:'สิ้นสุด',
}

export default function ContractsPage() {
  const [status, setStatus] = useState('')
  const [q,      setQ]      = useState('')
  const [page,   setPage]   = useState(1)
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', status, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: '20' })
      if (status) qs.set('status', status)
      const res  = await fetch(`/api/hr/contracts?${qs}`)
      const json = await res.json()
      return json.data
    },
  })

  const contracts = (data?.contracts ?? []).filter((c: any) =>
    !q || `${c.user?.first_name_th} ${c.user?.last_name_th} ${c.user?.employee_code}`.toLowerCase().includes(q.toLowerCase())
  )
  const total = data?.total ?? 0

  const handleExport = (fmt: 'xlsx'|'csv') => {
    window.open(`/api/export?type=contracts&format=${fmt}`, '_blank')
  }

  return (
    <div className="page-container space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          <h1>สัญญาจ้างงาน</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('xlsx')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />Excel
          </button>
          <button onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />CSV
          </button>
          <Link href="/hr/contracts/new"
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            <Plus className="w-4 h-4" />สร้างสัญญา
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส" className="form-input pl-9" />
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {['','draft','active','expired','terminated'].map(s => (
            <button key={s} onClick={() => { setStatus(s); setPage(1) }}
              className={cn('px-3 py-1.5 rounded-md text-sm transition-colors',
                status === s ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}>
              {s === '' ? 'ทั้งหมด' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{total} รายการ</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>เลขที่สัญญา</th>
                <th>ประเภท</th>
                <th>วันเริ่มงาน</th>
                <th>เงินเดือน</th>
                <th>สถานะ</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium shrink-0">
                        {c.user?.first_name_th?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{fullNameTH(c.user)}</p>
                        <p className="text-xs text-gray-400">{c.user?.employee_code} · {c.user?.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-gray-600">{c.contract_no}</td>
                  <td className="text-sm text-gray-600">{TYPE_LABEL[c.contract_type] ?? c.contract_type}</td>
                  <td className="text-sm text-gray-600 whitespace-nowrap">{c.start_date}</td>
                  <td className="text-sm font-medium text-gray-900">
                    {Number(c.base_salary).toLocaleString('th-TH')} ฿
                  </td>
                  <td>
                    <span className={cn('badge', STATUS_COLOR[c.status])}>{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td>
                    <Link href={`/hr/contracts/${c.id}`} className="text-gray-400 hover:text-gray-700">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!contracts.length && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">ไม่พบสัญญา</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
