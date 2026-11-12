import { memo, useState, type MouseEvent } from 'react'
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { narrowMonth, narrowWeekday, shortDayMonth } from '../lib/dates'
import type { TrendUnit } from '../lib/period'
import { bandIndexAt, bucketReadout, type TrendBucket } from '../lib/summarize'
import { useMeasuredWidth } from '../lib/useMeasuredWidth'
import { ChevronRightIcon } from './icons'

const HEIGHT = 148
// Clear paper at each side of the plot. The tap reader below divides the same
// width into columns, so both use this one number.
const SIDE = 2

// One rent-sized day flattens an ordinary one to well under a pixel (measured:
// 0.5px against a 122px rent bar), so a real day of spending renders as blank
// paper. Floor it at a visible stub. Deliberately a callback and not a plain
// number: Recharts applies a numeric minPointSize to *every* bar, and the
// buckets are zero-filled — a stub on a no-spend day would invent spending.
// The outlier still compresses the rest; this only guarantees "something
// happened here" survives, with the exact figure a tap away on the line under
// the plot.
const MIN_BAR = (value: number | null | undefined) => (value != null && value > 0 ? 3 : 0)

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

// Spend over time: vertical bars in one validated hue (styles in index.css),
// with the current still-filling period bar in clay (.bar-now → --now) so it
// reads as incomplete. Zero-filled buckets so empty spans read as ₹0.
// maxBarSize keeps a low-bucket chart (a 2-month custom range) from rendering
// slabs. Measured width, not ResponsiveContainer — see useMeasuredWidth
// (always-mounted [hidden] tab).
//
// A tap on a bar reads it on a line under the plot; it goes nowhere. The line
// carries the way on ("See entries"). A tap used to jump straight to History,
// which on a phone left no way to simply read a bar: the hover tooltip that
// showed its figure needs a cursor.
interface Props {
  buckets: TrendBucket[]
  unit: TrendUnit
  currency: string
  currentKey?: string
  /** "See entries" for the bar that was tapped. Without it bars are not tappable. */
  onSelect?: (key: string) => void
  /** A dashed line at this value, named by a key under the chart. Callers
      must memoize it, or the memo below is defeated. */
  reference?: { value: number; label: string }
  /** Entries per bucket that the series leaves out (fixed costs, under the
      split), so a bare column is not read out as an empty day. */
  leftOut?: ReadonlyMap<string, number>
}

// The expensive half — ~213 DOM nodes, the heaviest thing on Summary against
// the rest of the screen's ~155 — so it is memo'd: paging a period re-renders
// the screen, and rebuilding all of this when the data has not changed is what
// made the switch feel slow. Every prop must be stable across those renders
// or the memo is defeated; it takes no handlers, so none can defeat it.
const TrendChartBody = memo(function TrendChartBody({
  width,
  buckets,
  unit,
  currentKey,
  pickedKey,
  reference,
}: Pick<Props, 'buckets' | 'unit' | 'currentKey' | 'reference'> & {
  width: number
  pickedKey?: string
}) {
  return (
    // No accessibility layer: it makes the plot focusable so arrow keys can
    // walk a tooltip, and there is no tooltip — it would only leave a focus
    // ring round the chart after a tap.
    <BarChart
      width={width}
      height={HEIGHT}
      data={buckets}
      margin={{ top: 8, right: SIDE, bottom: 0, left: SIDE }}
      barCategoryGap={buckets.length > 20 ? 1 : 3}
      accessibilityLayer={false}
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
          <Cell
            key={b.key}
            className={
              b.key === pickedKey ? 'bar-picked' : b.key === currentKey ? 'bar-now' : undefined
            }
          />
        ))}
      </Bar>
      {/* extendDomain: in a quiet month every bar sits under the line, and the
         default (discard) would drop the line rather than make room for it. */}
      {reference && (
        <ReferenceLine
          y={reference.value}
          ifOverflow="extendDomain"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
    </BarChart>
  )
})

// The wrapper deliberately stays unmemoized. It owns the width measurement,
// and useMeasuredWidth depends on being re-rendered once the screen is
// unhidden — memoizing here would swallow exactly that render and leave the
// chart stuck at width 0 on any engine whose ResizeObserver never fires (the
// case that hook exists for). Everything costly sits behind TrendChartBody.
export function TrendChart({
  buckets,
  unit,
  currency,
  currentKey,
  onSelect,
  reference,
  leftOut,
}: Props) {
  const [wrapRef, width] = useMeasuredWidth()
  // The tapped bar, held with the series it was tapped in. A change of period
  // or of data hands over a new array and the pick lapses with it — no effect
  // to clear it, and a day picked in November is not still picked when a
  // range that happens to hold that day comes on screen.
  const [pick, setPick] = useState<{ key: string; of: TrendBucket[] } | null>(null)
  const picked = pick?.of === buckets ? (buckets.find((b) => b.key === pick.key) ?? null) : null
  const readout =
    picked && bucketReadout(picked, unit, currency, leftOut?.get(picked.key) ?? 0)

  // The column under the tap, worked out from where it landed: the whole
  // column counts, so a 3px stub is as easy to hit as a tall bar. Recharts
  // can name the column too, but only once the pointer has moved over the
  // plot — measured: a tap with no move before it reported nothing.
  function pickAt(e: MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const i = bandIndexAt(e.clientX - box.left, box.width, buckets.length, SIDE)
    if (i !== null) setPick({ key: buckets[i].key, of: buckets })
  }

  return (
    <>
      <div
        className="trend-chart"
        ref={wrapRef}
        data-clickable={onSelect ? '' : undefined}
        onClick={onSelect ? pickAt : undefined}
      >
        {width > 0 && (
          <TrendChartBody
            width={width}
            buckets={buckets}
            unit={unit}
            currentKey={currentKey}
            pickedKey={picked?.key}
            reference={reference}
          />
        )}
      </div>
      {/* A key under the plot, not a label on the line: the label measures
         ~145px, half of the 297px plot at 375px, so riding the line it would
         sit across the bars of any day that went over. */}
      {reference && (
        <p className="trend-ref">
          <svg viewBox="0 0 16 4" aria-hidden="true">
            <path d="M0 2h16" />
          </svg>
          {reference.label}
        </p>
      )}
      {/* Last in the card, and one height in both states, so reading a bar
         moves nothing above or below it. A bucket with no entries at all has
         nothing to see; one whose entries the series leaves out still does. */}
      {onSelect && (
        <div className="trend-pick" aria-live="polite">
          {picked && readout ? (
            <>
              <span className="trend-pick-text">
                <strong>{readout.label}</strong> · {readout.detail}
              </span>
              {readout.entries > 0 && (
                <button
                  type="button"
                  className="btn-text trend-pick-go"
                  onClick={() => onSelect(picked.key)}
                >
                  See entries
                  <ChevronRightIcon size={14} />
                </button>
              )}
            </>
          ) : (
            <span>Tap a bar for its total</span>
          )}
        </div>
      )}
    </>
  )
}
