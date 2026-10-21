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

// Fixed pixel height for the bar area itself (separate from the badge/value
// labels above and the year label below it) — 2026-10-22, "นอกจากกราฟแท่งที่
// ทำดีแล้ว ให้เพิ่มกราฟที่ยอดกราฟแท่งด้วย": a trend line connecting each
// bar's top needs a coordinate space it can measure itself against, which a
// pure flex/percentage layout doesn't give you. This area is that space —
// the bars (height: X% of BAR_AREA_PX) and the SVG overlay (viewBox 0 0 100
// 100, stretched over the same box) both read "bar top" as the same number,
// so the line always meets the bar exactly, however tall the chart ends up.
const BAR_AREA_PX = 140

export function YearBarChart({ data }: { data: YearBarDatum[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  // Chronological left-to-right for a trend read, even though the table next
  // to it lists newest-first (matching the rest of the Jobs page's convention).
  const chrono = [...data].sort((a, b) => a.year - b.year)
  const n = chrono.length
  const barHeightPct = (v: number) => Math.max((v / max) * 100, 2)

  return (
    <div className="px-2">
      {/* badge + value labels, one column per bar */}
      <div className="flex gap-3">
        {chrono.map(d => {
          const up   = d.deltaPct !== null && d.deltaPct > 0
          const down = d.deltaPct !== null && d.deltaPct < 0
          return (
            <div key={d.year} className="flex-1 flex flex-col items-center min-w-0">
              {d.deltaPct !== null ? (
                <span className={`text-[10px] font-medium whitespace-nowrap ${up ? 'text-green-600' : down ? 'text-red-600' : 'text-gray-400'}`}>
                  {up ? '▲' : down ? '▼' : '–'} {Math.abs(d.deltaPct).toFixed(1)}%
                </span>
              ) : (
                <span className="text-[10px] text-transparent select-none">—</span>
              )}
              <span className="text-[10px] text-gray-500 whitespace-nowrap">{formatTHBCompact(d.value)}</span>
            </div>
          )
        })}
      </div>

      {/* bars + trend-line overlay, sharing one coordinate space */}
      <div className="relative flex items-end gap-3 mt-1" style={{ height: BAR_AREA_PX }}>
        {chrono.map(d => (
          <div key={d.year} className="flex-1 flex items-end justify-center h-full min-w-0">
            <div
              className="w-full max-w-12 rounded-t-md bg-blue-600"
              style={{ height: `${barHeightPct(d.value)}%` }}
              title={`ปี ${d.year}: ${d.value.toLocaleString('th-TH')} บาท`}
            />
          </div>
        ))}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={chrono.map((d, i) => `${((i + 0.5) / n) * 100},${100 - barHeightPct(d.value)}`).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {chrono.map((d, i) => (
          <div
            key={d.year}
            className="absolute w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white shadow-sm"
            style={{
              left: `${((i + 0.5) / n) * 100}%`,
              top: `${100 - barHeightPct(d.value)}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title={`ปี ${d.year}: ${d.value.toLocaleString('th-TH')} บาท`}
          />
        ))}
      </div>

      {/* year labels */}
      <div className="flex gap-3 mt-1.5">
        {chrono.map(d => (
          <div key={d.year} className="flex-1 text-center text-xs text-gray-600 font-medium min-w-0">{d.year}</div>
        ))}
      </div>
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
