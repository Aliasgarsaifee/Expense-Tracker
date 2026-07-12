import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../lib/money'
import type { CategoryTotal } from '../lib/summarize'

const ROW_HEIGHT = 36

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
// single (validated) hue — bar colors and text styles live in index.css.
export function CategoryChart({
  data,
  currency,
}: {
  data: CategoryTotal[]
  currency: string
}) {
  return (
    <div className="category-chart">
      <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 10}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 84, bottom: 0, left: 0 }}
          barCategoryGap={9}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="category"
            width={94}
            interval={0}
            tickLine={false}
            axisLine={false}
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
      </ResponsiveContainer>
    </div>
  )
}
