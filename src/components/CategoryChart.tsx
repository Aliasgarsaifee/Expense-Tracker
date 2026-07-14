import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../lib/money'
import type { CategoryTotal } from '../lib/summarize'
import { useMeasuredWidth } from '../lib/useMeasuredWidth'

const ROW_HEIGHT = 36

// The 94px axis fits ~12 characters at the 13px tick size; longer custom
// category names would otherwise collide with the bars.
const clipTick = (label: string) =>
  label.length > 12 ? `${label.slice(0, 11)}…` : label

interface TipProps {
  active?: boolean
  payload?: Array<{ payload: CategoryTotal }>
  currency: string
}

function ChartTip({ active, payload, currency }: TipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="chart-tip">
      <strong>{d.category}</strong> · {formatMoney(d.total, currency)} ·{' '}
      {d.count === 1 ? '1 entry' : `${d.count} entries`}
    </div>
  )
}

// Labeled bar list: one measure, identity carried by the row label, so a
// single (validated) hue — bar colors and text styles live in index.css. The
// wrapper width is measured by hand (see useMeasuredWidth) because this chart
// lives in an always-mounted [hidden] tab.
export function CategoryChart({
  data,
  currency,
  onSelect,
}: {
  data: CategoryTotal[]
  currency: string
  onSelect?: (category: string) => void
}) {
  const [wrapRef, width] = useMeasuredWidth()

  return (
    <div className="category-chart" ref={wrapRef} data-clickable={onSelect ? '' : undefined}>
      {width > 0 && (
        <BarChart
          width={width}
          height={data.length * ROW_HEIGHT + 10}
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 84, bottom: 0, left: 0 }}
          barCategoryGap={9}
          onClick={
            onSelect
              ? (s) => {
                  // activeLabel is the YAxis category value of the tapped row.
                  if (s?.activeLabel != null) onSelect(String(s.activeLabel))
                }
              : undefined
          }
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="category"
            width={94}
            interval={0}
            tickLine={false}
            axisLine={false}
            tickFormatter={clipTick}
          />
          <Tooltip content={<ChartTip currency={currency} />} isAnimationActive={false} />
          <Bar dataKey="total" barSize={16} radius={[0, 4, 4, 0]} animationDuration={500}>
            <LabelList
              dataKey="total"
              position="right"
              formatter={(value) => formatMoney(value as number, currency)}
            />
          </Bar>
        </BarChart>
      )}
    </div>
  )
}
