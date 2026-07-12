import { useEffect, useRef, useState } from 'react'
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../lib/money'
import type { CategoryTotal } from '../lib/summarize'

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
// single (validated) hue — bar colors and text styles live in index.css.
//
// The width is measured by hand instead of recharts' ResponsiveContainer:
// this chart mounts inside a [hidden] section (all tabs stay mounted), where
// ResponsiveContainer reads 0×0 and shows nothing until its ResizeObserver
// fires — and some embedded WebViews never deliver observer callbacks at
// all. Measuring after every render needs no observer: the tab switch that
// unhides this screen always re-renders it, and that render sees the box.
export function CategoryChart({
  data,
  currency,
}: {
  data: CategoryTotal[]
  currency: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // No dep array on purpose: the unhide is driven by the parent's tab state,
  // which this component can't list as a dependency. setWidth with an
  // unchanged value is a no-op, so this settles instead of looping.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const w = wrapRef.current?.offsetWidth ?? 0
    if (w > 0) setWidth(w)
  })

  // Live resizes (rotation, split view) on engines with working observers.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      if (w > 0) setWidth(w)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <div className="category-chart" ref={wrapRef}>
      {width > 0 && (
        <BarChart
          width={width}
          height={data.length * ROW_HEIGHT + 10}
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
