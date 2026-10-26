'use client'
// src/app/inside/page.tsx
// CONNEX Inside — v1 dashboard: มูลค่างาน รายปี/ลูกค้า (2026-10-26, "โดย
// โมดูลจะดึงข้อมูลนี้ Job Codes มูลค่างานรวม สรุปมูลค่างาน รายปี/ลูกค้า
// แสดงเป็น dashboard"). Pulls the exact same data/components as the existing
// สรุปมูลค่างาน page (src/app/access/jobs/revenue/page.tsx) — same
// useJobsRevenueSummary hook (→ /api/admin/jobs/revenue-summary) and the
// same YearBarChart/ClientBarChart/formatTHBCompact — so the numbers here
// can never disagree with that page. This is just a second, admin-only
// "insights" home for the same report; more company-wide metrics can be
// added as additional cards/sections below later without a new module.
import Link from 'next/link'
import { useJobsRevenueSummary } from '@/hooks/useAdmin'
import { YearBarChart, ClientBarChart, formatTHBCompact } from '@/components/charts/RevenueCharts'
import { ArrowLeft, Coins, Loader2, TrendingUp, TrendingDown, Minus, LineChart } from 'lucide-react'

function formatTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท'
}

function formatTHBShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return formatTHBCompact(n) + ' บาท'
}

export default function ConnexInsidePage() {
  const { data, isLoading } = useJobsRevenueSummary()

  const byYear   = data?.byYear ?? []
  const byClient = data?.byClient ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/hub"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับไปหน้าเลือกระบบ</span>
          </Link>
        </div>
      </header>

      <div className="page-container max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0">
            <LineChart className="w-5 h-5" />
          </div>
          <div>
            <h1>CONNEX Inside</h1>
            <p className="text-xs text-gray-500">ภาพรวมข้อมูลองค์กร — เริ่มต้นด้วยสรุปมูลค่างาน รายปี/ลูกค้า</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : !data || data.countWithValue === 0 ? (
          <div className="card card-body text-center py-12 text-gray-400 text-sm">
            ยังไม่มี Job ที่ระบุมูลค่างาน — ไปเพิ่มมูลค่างานที่หน้า{' '}
            <Link href="/access/jobs" className="text-blue-600 hover:underline">Job Codes</Link> ก่อน
          </div>
        ) : (
          <>
            {/* ยอดรวมทั้งหมด */}
            <div className="card card-body space-y-1">
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                ยอดรวมทั้งหมด (ทุกปี ทุกลูกค้า)
              </p>
              <p className="text-3xl font-semibold text-gray-900" title={formatTHB(data.total)}>{formatTHBShort(data.total)}</p>
              <p className="text-xs text-gray-400">
                มีการระบุมูลค่างานแล้ว {data.countWithValue} จาก {data.countTotal} Job
              </p>
            </div>

            {/* แยกปี + เปรียบเทียบปี */}
            <div className="card card-body space-y-4">
              <h3 className="text-sm font-medium text-gray-700">มูลค่างานแยกตามปี</h3>
              <YearBarChart data={byYear} />
              <div className="overflow-x-auto">
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th>ปี</th>
                      <th className="text-right">จำนวน Job</th>
                      <th className="text-right">มูลค่างาน</th>
                      <th className="text-right">เทียบปีก่อนหน้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byYear.map(y => (
                      <tr key={y.year}>
                        <td className="font-medium text-gray-900">{y.year}</td>
                        <td className="text-right text-gray-600">{y.count}</td>
                        <td className="text-right text-gray-900" title={formatTHB(y.value)}>{formatTHBShort(y.value)}</td>
                        <td className="text-right whitespace-nowrap">
                          {y.delta === null ? (
                            <span className="text-gray-400 inline-flex items-center gap-1 justify-end">
                              <Minus className="w-3.5 h-3.5" /> ไม่มีข้อมูลปีก่อนหน้า
                            </span>
                          ) : y.delta > 0 ? (
                            <span className="text-green-600 inline-flex items-center gap-1 justify-end font-medium" title={formatTHB(y.delta)}>
                              <TrendingUp className="w-3.5 h-3.5" />
                              เพิ่มขึ้น {formatTHBShort(y.delta)} ({y.deltaPct?.toFixed(1)}%)
                            </span>
                          ) : y.delta < 0 ? (
                            <span className="text-red-600 inline-flex items-center gap-1 justify-end font-medium" title={formatTHB(Math.abs(y.delta))}>
                              <TrendingDown className="w-3.5 h-3.5" />
                              ลดลง {formatTHBShort(Math.abs(y.delta))} ({Math.abs(y.deltaPct ?? 0).toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-gray-400 inline-flex items-center gap-1 justify-end">
                              <Minus className="w-3.5 h-3.5" /> ไม่เปลี่ยนแปลง
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!!data?.unassignedCount && (
                      <tr>
                        <td className="text-gray-500">ไม่ระบุปี (ไม่มีรหัส Jxx)</td>
                        <td className="text-right text-gray-500">{data.unassignedCount}</td>
                        <td className="text-right text-gray-500" title={formatTHB(data.unassignedValue)}>{formatTHBShort(data.unassignedValue)}</td>
                        <td className="text-right text-gray-300">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* แยกผู้ว่าจ้าง */}
            <div className="card card-body space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">มูลค่างานแยกตามผู้ว่าจ้าง</h3>
                {byClient.length > 10 && (
                  <p className="text-xs text-gray-400">แสดง 10 อันดับแรกจาก {byClient.length} ราย</p>
                )}
              </div>
              <ClientBarChart data={byClient} limit={10} />
              <div className="overflow-x-auto">
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th>ผู้ว่าจ้าง</th>
                      <th className="text-right">จำนวน Job</th>
                      <th className="text-right">มูลค่างานรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byClient.map(c => (
                      <tr key={c.client}>
                        <td className="text-gray-900">{c.client}</td>
                        <td className="text-right text-gray-600">{c.count}</td>
                        <td className="text-right text-gray-900" title={formatTHB(c.value)}>{formatTHBShort(c.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
