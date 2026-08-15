import { memo } from 'react'
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from 'recharts'
import { narrowMonth, narrowWeekday, shortDayMonth, shortMonthYear } from '../lib/dates'
import { formatMoney } from '../lib/money'
import type { TrendUnit } from '../lib/period'
import type { TrendBucket } from '../lib/summarize'
import { useMeasuredWidth } from '../lib/useMeasuredWidth'

const HEIGHT = 148

// One rent-sized day flattens an ordinary one to well under a pixel (measured:
// 0.5px against a 122px rent bar), so a real day of spending renders as blank
// paper. Floor it at a visible stub. Deliberately a callback and not a plain
// number: Recharts applies a numeric minPointSize to *every* bar, and the
// buckets are zero-filled — a stub on a no-spend day would invent spending.
// The outlier still compresses the rest; this only guarantees "something
// happened here" survives, with the exact figure a tap away in the tooltip.
const MIN_BAR = (value: number | null | undefined) => (value != null && value > 0 ? 3 : 0)

// Full label for the tooltip: "7 Jul" / "Week of 6 Jul" / "Jun 2025" / "2024".
function keyLabel(key: string, unit: TrendUnit): string {
  if (unit === 'year') return key
  if (unit === 'month') return shortMonthYear(key)
  if (unit === 'week') return `Week of ${shortDayMonth(key)}`
  return shortDayMonth(key)
}

// Sparse axis tick: a single-letter weekday for a week of days, day-of-month
// roughly weekly for longer day spans, week starts as "6 Jul" (every other
// one once "d MMM" labels would touch, a month initial on each month's first
// week once they crowd), a month initial per month, the year per year.
// interval={0} runs this for every bucket on every render, so it reads the
// day straight off the ISO key rather than building a Date to ask.
function tickLabel(key: string, unit: TrendUnit, count: number, index: number): string {
  if (unit === 'year') return key
  if (unit === 'month') return narrowMonth(key)
  const dayOfMonth = Number(key.slice(8, 10))
  if (unit === 'week') {
    // Week grain spans ≥ 43 days, so there are always ≥ 7 buckets: alternate
    // "d MMM" ticks up to 8, then a month initial on each month's first week.
    if (count <= 8) return index % 2 === 0 ? shortDayMonth(key) : ''
    return dayOfMonth <= 7 ? narrowMonth(key.slice(0, 7)) : ''
  }
  if (count <= 7) return narrowWeekday(key)
  return dayOfMonth % 7 === 1 ? String(dayOfMonth) : ''
}

interface TipProps {
  active?: boolean
  payload?: Array<{ payload: TrendBucket }>
  unit: TrendUnit
  currency: string
}

function TrendTip({ active, payload, unit, currency }: TipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="chart-tip">
      <strong>{keyLabel(d.key, unit)}</strong> · {formatMoney(d.total, currency)} ·{' '}
      {d.count === 1 ? '1 entry' : `${d.count} entries`}
    </div>
  )
}

// Spend over time: vertical bars in one validated hue (styles in index.css),
// with the current still-filling period bar in clay (.bar-now → --now) so it
// reads as incomplete. Zero-filled buckets so empty spans read as ₹0.
// maxBarSize keeps a low-bucket chart (a 2-month custom range) from rendering
// slabs. Measured width, not ResponsiveContainer — see useMeasuredWidth
// (always-mounted [hidden] tab).
interface Props {
  buckets: TrendBucket[]
  unit: TrendUnit
  currency: string
  currentKey?: string
  onSelect?: (key: string) => void
}

// The expensive half — ~213 DOM nodes, the heaviest thing on Summary against
// the rest of the screen's ~155 — so it is memo'd: paging a period re-renders
// the screen, and rebuilding all of this when the data has not changed is what
// made the switch feel slow. Callers must pass a stable onSelect (useCallback)
// or the memo is defeated.
const TrendChartBody = memo(function TrendChartBody({
  width,
  buckets,
  unit,
  currency,
  currentKey,
  onSelect,
}: Props & { width: number }) {
  return (
    <BarChart
      width={width}
      height={HEIGHT}
      data={buckets}
      margin={{ top: 8, right: 2, bottom: 0, left: 2 }}
      barCategoryGap={buckets.length > 20 ? 1 : 3}
      onClick={
        onSelect
          ? (s) => {
              // activeLabel is the XAxis key of the tapped bucket.
              if (s?.activeLabel != null) onSelect(String(s.activeLabel))
            }
          : undefined
      }
    >
      <XAxis
        dataKey="key"
        interval={0}
        tickLine={false}
        axisLine={false}
        height={18}
        tickFormatter={(key: string, i: number) => tickLabel(key, unit, buckets.length, i)}
      />
      <YAxis hide domain={[0, 'dataMax']} />
      <Tooltip
        content={<TrendTip unit={unit} currency={currency} />}
        isAnimationActive={false}
      />
      {/* No grow-from-zero animation: paging a month re-ran it every time,
         which is half a second of rAF re-renders before the bars settle — it
         read as the chart loading, not as motion. Paging should land like a
         native list, immediately. */}
      <Bar
        dataKey="total"
        maxBarSize={56}
        minPointSize={MIN_BAR}
        radius={[3, 3, 0, 0]}
        isAnimationActive={false}
      >
        {buckets.map((b) => (
          <Cell key={b.key} className={b.key === currentKey ? 'bar-now' : undefined} />
        ))}
      </Bar>
    </BarChart>
  )
})

// The wrapper deliberately stays unmemoized. It owns the width measurement,
// and useMeasuredWidth depends on being re-rendered once the screen is
// unhidden — memoizing here would swallow exactly that render and leave the
// chart stuck at width 0 on any engine whose ResizeObserver never fires (the
// case that hook exists for). Everything costly sits behind TrendChartBody.
export function TrendChart({ buckets, unit, currency, currentKey, onSelect }: Props) {
  const [wrapRef, width] = useMeasuredWidth()

  return (
    <div className="trend-chart" ref={wrapRef} data-clickable={onSelect ? '' : undefined}>
      {width > 0 && (
        <TrendChartBody
          width={width}
          buckets={buckets}
          unit={unit}
          currency={currency}
          currentKey={currentKey}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}
