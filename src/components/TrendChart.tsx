import { Bar, BarChart, Tooltip, XAxis, YAxis } from 'recharts'
import { shortDayMonth, shortMonthYear } from '../lib/dates'
import { formatMoney } from '../lib/money'
import type { TrendUnit } from '../lib/period'
import type { TrendBucket } from '../lib/summarize'
import { useMeasuredWidth } from '../lib/useMeasuredWidth'

const HEIGHT = 148

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
function tickLabel(key: string, unit: TrendUnit, count: number, index: number): string {
  if (unit === 'year') return key
  if (unit === 'month') {
    const m = Number(key.slice(5, 7))
    return new Date(2000, m - 1, 1).toLocaleDateString('en-IN', { month: 'narrow' })
  }
  const d = new Date(key + 'T00:00:00')
  if (unit === 'week') {
    // Week grain spans ≥ 43 days, so there are always ≥ 7 buckets: alternate
    // "d MMM" ticks up to 8, then a month initial on each month's first week.
    if (count <= 8) return index % 2 === 0 ? shortDayMonth(key) : ''
    return d.getDate() <= 7 ? d.toLocaleDateString('en-IN', { month: 'narrow' }) : ''
  }
  if (count <= 7) return d.toLocaleDateString('en-IN', { weekday: 'narrow' })
  return d.getDate() % 7 === 1 ? String(d.getDate()) : ''
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

// Spend over time: vertical bars, one validated hue (styles in index.css),
// zero-filled buckets so empty spans read as ₹0. maxBarSize keeps a
// low-bucket chart (a 2-month custom range) from rendering slabs. Measured
// width, not ResponsiveContainer — see useMeasuredWidth (always-mounted
// [hidden] tab).
export function TrendChart({
  buckets,
  unit,
  currency,
  onSelect,
}: {
  buckets: TrendBucket[]
  unit: TrendUnit
  currency: string
  onSelect?: (key: string) => void
}) {
  const [wrapRef, width] = useMeasuredWidth()

  return (
    <div className="trend-chart" ref={wrapRef} data-clickable={onSelect ? '' : undefined}>
      {width > 0 && (
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
            tickFormatter={(key: string, i: number) =>
              tickLabel(key, unit, buckets.length, i)
            }
          />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            content={<TrendTip unit={unit} currency={currency} />}
            isAnimationActive={false}
          />
          <Bar dataKey="total" maxBarSize={56} radius={[3, 3, 0, 0]} animationDuration={500} />
        </BarChart>
      )}
    </div>
  )
}
