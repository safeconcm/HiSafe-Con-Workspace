'use client'
// src/app/access/jobs/revenue/page.tsx
// สรุปมูลค่างาน (2026-10-22, "เมื่อรู้มูลค่างานก็รวมสรุปทั้งหมด แยกปี แยก
// ผู้ว่าจ้างด้วย เปรียบเทียบปี เพิ่มขึ้น หรือลดลง ทำกราฟด้วย") — a dedicated
// page (rather than cramming into the Jobs list page) so there's room for
// both charts and their full backing tables. Pulled from the same
// /api/admin/jobs/revenue-summary endpoint the Jobs page's small summary
// card already uses (src/hooks/useAdmin.ts useJobsRevenueSummary), now
// extended server-side (src/app/api/admin/jobs/revenue-summary/route.ts) to
// also return a by-client breakdown and a year-over-year delta per year —
// so this page and that card can never disagree on the numbers.
//
// 2026-10-22 bugfix: "ปี" here is the real project year parsed from the
// Job's "Jxx" code (same as the Jobs list's own J24/J25/J26 groups, see
// src/lib/jobs-grouping.ts), not the jobs.year DB column — see the API
// route's comment for why those two are NOT the same thing.
import Link from 'next/link'
import { useJobsRevenueSummary } from '@/hooks/useAdmin'
import { YearBarChart, ClientBarChart, formatTHBCompact } from '@/components/charts/RevenueCharts'
import { ArrowLeft, Coins, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

function formatTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท'
}

// Compact K/M display for the page's headline/table figures (2026-10-22,
// "ตัวเลขมันเยอะ ให้แสดงแบบ K M") — the full-precision value from formatTHB
// above is kept available via a `title` tooltip on each figure, so hovering
// still gives the exact บาท amount.
function formatTHBShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return formatTHBCompact(n) + ' บาท'
}

export default function JobsRevenuePage() {
  const { data, isLoading } = useJobsRevenueSummary()

  const byYear   = data?.byYear ?? []
  const byClient = data?.byClient ?? []

  return (
    <div className="page-container max-w-5xl space-y-5">

      <div className="flex items-center gap-3">
        <Link href="/access/jobs" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Coins className="w-5 h-5 text-amber-500" />
        <h1>สรุปมูลค่างาน รายปี/ลูกค้า</h1>
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
            <p className="text-xs text-gray-400">ยอดรวมทั้งหมด (ทุกปี ทุกลูกค้า)</p>
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
                  {/* Jobs with a value but no recognizable "Jxx" year prefix
                      (2026-10-22 bugfix) — can't be placed on the year axis,
                      so they're broken out here instead of being silently
                      dropped or miscounted into some other year. */}
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
  )
}
