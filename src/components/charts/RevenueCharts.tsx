'use client'
// src/components/charts/RevenueCharts.tsx
// Two tiny, dependency-free charts for the Job Codes revenue summary page
// (2026-10-22, "เมื่อรู้มูลค่างานก็รวมสรุปทั้งหมด แยกปี แยกผู้ว่าจ้างด้วย
// เปรียบเทียบปี เพิ่มขึ้น หรือลดลง ทำกราฟด้วย"). No charting library is
// installed in this project (recharts/chart.js etc.) — rather than add a new
// dependency for two simple bar charts, these are plain divs sized with
// inline-style percentages, which is robust, has zero bundle cost, and needs
// no client-side JS beyond React itself.
//
// YearBarChart: vertical columns, one per year, left-to-right chronological
// (oldest -> newest, matching how a trend is normally read), each annotated
// with its year-over-year % change badge (green = up, red = down, gray = no
// prior-year data to compare against).
//
// ClientBarChart: horizontal bars — client names are long Thai company names
// that wrap badly as a column label under a vertical bar, so a horizontal
// bar (label on the left, bar + value on the right) reads far better.

function formatTHBCompact(n: number): string {
  // Short form for in-chart labels (฿1.2M instead of ฿1,234,567) — the exact
  // value is always shown in the table below each chart, so the chart label
  // only needs to be readable at a glance.
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1_000)     return (n / 1_000).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + 'K'
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export interface YearBarDatum {
  year: number
  value: number
  deltaPct: number | null
}

export function YearBarChart({ data }: { data: YearBarDatum[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  // Chronological left-to-right for a trend read, even though the table next
  // to it lists newest-first (matching the rest of the Jobs page's convention).
  const chrono = [...data].sort((a, b) => a.year - b.year)

  return (
    <div className="flex items-end gap-3 h-48 px-2">
      {chrono.map(d => {
        const h = Math.max((d.value / max) * 100, 2)
        const up   = d.deltaPct !== null && d.deltaPct > 0
        const down  = d.deltaPct !== null && d.deltaPct < 0
        return (
          <div key={d.year} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            {d.deltaPct !== null && (
              <span className={`text-[10px] font-medium mb-1 whitespace-nowrap ${up ? 'text-green-600' : down ? 'text-red-600' : 'text-gray-400'}`}>
                {up ? '▲' : down ? '▼' : '–'} {Math.abs(d.deltaPct).toFixed(1)}%
              </span>
            )}
            <span className="text-[10px] text-gray-500 mb-1 whitespace-nowrap">{formatTHBCompact(d.value)}</span>
            <div
              className="w-full max-w-12 rounded-t-md bg-blue-600"
              style={{ height: `${h}%` }}
              title={`ปี ${d.year}: ${d.value.toLocaleString('th-TH')} บาท`}
            />
            <span className="text-xs text-gray-600 mt-1.5 font-medium">{d.year}</span>
          </div>
        )
      })}
    </div>
  )
}

export interface ClientBarDatum {
  client: string
  value: number
}

export function ClientBarChart({ data, limit = 10 }: { data: ClientBarDatum[]; limit?: number }) {
  const top = data.slice(0, limit)
  if (!top.length) return null
  const max = Math.max(...top.map(d => d.value), 1)

  return (
    <div className="space-y-2.5">
      {top.map(d => {
        const w = Math.max((d.value / max) * 100, 2)
        return (
          <div key={d.client} className="flex items-center gap-3">
            <div className="w-32 sm:w-40 shrink-0 text-xs text-gray-600 truncate text-right" title={d.client}>
              {d.client}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="h-5 rounded bg-amber-500"
                style={{ width: `${w}%` }}
                title={`${d.client}: ${d.value.toLocaleString('th-TH')} บาท`}
              />
            </div>
            <div className="w-20 shrink-0 text-xs text-gray-700 font-medium whitespace-nowrap">
              {formatTHBCompact(d.value)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
