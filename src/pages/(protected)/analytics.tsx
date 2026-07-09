/**
 * Analytics — share of voice, sentiment over time, volume by source.
 * Hand-rolled SVG marks following the dataviz method: validated palette
 * (against the midnight card surface), thin marks with rounded data-ends,
 * 2px surface gaps, hover tooltips, legends + table fallbacks.
 */

import { useMemo, useState } from 'react'
import { useQuery } from 'deepspace'
import { EmptyState, cn } from '@/components/ui'
import { PageHeader, SectionLabel } from '../../components/PageHeader'
import type { Keyword, Mention } from '../../types'

// Validated against surface #141b2c (midnight card): all ≥3:1, CVD ΔE 41+.
const SERIES = { blue: '#3987e5', aqua: '#199e70', yellow: '#c98500', violet: '#9085e9' }
const KEYWORD_TYPE_COLOR: Record<string, string> = {
  brand: SERIES.blue,
  feature: SERIES.aqua,
  competitor: SERIES.yellow,
  pain_point: SERIES.violet,
}
// Sentiment is polarity: poles + neutral gray midpoint (legend carries identity).
const SENTIMENT_COLOR = { positive: '#0ca30c', neutral: '#898781', negative: '#d03b3b' }

const RANGES = [
  { id: 7, label: 'Last 7 days', short: '7d' },
  { id: 30, label: 'Last 30 days', short: '30d' },
  { id: 90, label: 'Last 90 days', short: '90d' },
]

interface Tip {
  x: number
  y: number
  text: string
}

export default function AnalyticsPage() {
  const { records: mentions, status } = useQuery<Mention>('mentions', {
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 1000,
  })
  const { records: keywords } = useQuery<Keyword>('keywords', { limit: 100 })
  const [rangeDays, setRangeDays] = useState(30)
  const [tip, setTip] = useState<Tip | null>(null)

  const windowed = useMemo(() => {
    const since = Date.now() - rangeDays * 24 * 3600_000
    return (mentions ?? []).filter((r) => new Date(r.createdAt).getTime() >= since)
  }, [mentions, rangeDays])

  const scored = windowed.filter((r) => r.data.relevance !== 'pending')

  // ── aggregates ────────────────────────────────────────────────────────────
  const bySource = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of windowed) counts.set(r.data.source, (counts.get(r.data.source) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [windowed])

  const sentimentByDay = useMemo(() => {
    const days: { day: string; positive: number; neutral: number; negative: number }[] = []
    const buckets = new Map<string, { positive: number; neutral: number; negative: number }>()
    const n = Math.min(rangeDays, 30)
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600_000)
      const key = d.toISOString().slice(0, 10)
      const bucket = { positive: 0, neutral: 0, negative: 0 }
      buckets.set(key, bucket)
      days.push({ day: key, ...bucket })
    }
    for (const r of scored) {
      const key = new Date(r.createdAt).toISOString().slice(0, 10)
      const bucket = buckets.get(key)
      const s = r.data.sentiment
      if (bucket && (s === 'positive' || s === 'neutral' || s === 'negative')) bucket[s]++
    }
    return days.map((d) => ({ day: d.day, ...buckets.get(d.day)! }))
  }, [scored, rangeDays])

  const shareOfVoice = useMemo(() => {
    const byKeyword = new Map<string, number>()
    for (const r of windowed) {
      if (r.data.keyword_id) byKeyword.set(r.data.keyword_id, (byKeyword.get(r.data.keyword_id) ?? 0) + 1)
    }
    const total = [...byKeyword.values()].reduce((a, b) => a + b, 0)
    return (keywords ?? [])
      .map((k) => ({
        term: k.data.term,
        type: k.data.keyword_type ?? 'brand',
        count: byKeyword.get(k.recordId) ?? 0,
        share: total > 0 ? (byKeyword.get(k.recordId) ?? 0) / total : 0,
      }))
      .filter((k) => k.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [windowed, keywords])

  const negatives = scored.filter((r) => r.data.sentiment === 'negative').length
  const highRelevance = scored.filter((r) => r.data.relevance === 'high').length

  return (
    <div className="flex min-h-full flex-col" onMouseLeave={() => setTip(null)}>
      <PageHeader
        title="Analytics"
        meta={<span>{windowed.length} mentions in window</span>}
        actions={
          <div
            data-testid="range-filter"
            className="flex items-center gap-0.5 rounded-md border border-border bg-card/50 p-0.5"
            role="group"
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeDays(r.id)}
                aria-label={r.label}
                title={r.label}
                aria-pressed={rangeDays === r.id}
                className={cn(
                  'inline-flex h-7 items-center rounded-[5px] px-2.5 text-xs font-medium transition-colors',
                  rangeDays === r.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.short}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 px-4 py-4 sm:px-6">
        {status !== 'loading' && windowed.length === 0 && (
          <div className="mb-4 rounded-lg border border-border">
            <EmptyState
              title="No data in this window"
              description="Mentions will show up here as they're ingested."
            />
          </div>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stat-tiles">
          <StatTile label="Mentions" value={windowed.length} />
          <StatTile label="AI-scored" value={scored.length} />
          <StatTile label="High relevance" value={highRelevance} />
          <StatTile label="Negative" value={negatives} />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Volume by source */}
          <ChartCard title="Volume by source" testId="chart-sources">
            {bySource.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No data.</p>
            ) : (
              <HBars
                rows={bySource.map(([source, count]) => ({
                  label: source,
                  value: count,
                  color: SERIES.blue,
                }))}
                onHover={setTip}
                format={(v) => `${v} mentions`}
              />
            )}
            <TableFallback
              caption="Volume by source"
              headers={['Source', 'Mentions']}
              rows={bySource.map(([s, c]) => [s, String(c)])}
            />
          </ChartCard>

          {/* Share of voice */}
          <ChartCard title="Share of voice" testId="chart-sov">
            {shareOfVoice.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No keyword-attributed mentions yet.</p>
            ) : (
              <>
                <HBars
                  rows={shareOfVoice.map((k) => ({
                    label: k.term,
                    value: k.count,
                    color: KEYWORD_TYPE_COLOR[k.type] ?? SERIES.blue,
                    suffix: `${Math.round(k.share * 100)}%`,
                  }))}
                  onHover={setTip}
                  format={(v) => `${v} mentions`}
                />
                <Legend
                  items={Object.entries(KEYWORD_TYPE_COLOR).map(([type, color]) => ({
                    label: type.replace('_', ' '),
                    color,
                  }))}
                />
              </>
            )}
            <TableFallback
              caption="Share of voice"
              headers={['Keyword', 'Type', 'Mentions', 'Share']}
              rows={shareOfVoice.map((k) => [k.term, k.type, String(k.count), `${Math.round(k.share * 100)}%`])}
            />
          </ChartCard>
        </div>

        {/* Sentiment over time */}
        <div className="mt-3">
          <ChartCard title={`Sentiment by day (last ${Math.min(rangeDays, 30)} days)`} testId="chart-sentiment">
            <SentimentBars days={sentimentByDay} onHover={setTip} />
            <Legend
              items={[
                { label: 'positive', color: SENTIMENT_COLOR.positive },
                { label: 'neutral', color: SENTIMENT_COLOR.neutral },
                { label: 'negative', color: SENTIMENT_COLOR.negative },
              ]}
            />
            <TableFallback
              caption="Sentiment by day"
              headers={['Day', 'Positive', 'Neutral', 'Negative']}
              rows={sentimentByDay
                .filter((d) => d.positive + d.neutral + d.negative > 0)
                .map((d) => [d.day, String(d.positive), String(d.neutral), String(d.negative)])}
            />
          </ChartCard>
        </div>
      </div>

      {tip && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-foreground shadow-card"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}

function ChartCard({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-border bg-card/50 p-4">
      <SectionLabel className="mb-3">{title}</SectionLabel>
      {children}
    </section>
  )
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Horizontal bars: thin marks, 4px rounded data-end, direct labels. */
function HBars({
  rows,
  onHover,
  format,
}: {
  rows: { label: string; value: number; color: string; suffix?: string }[]
  onHover: (t: Tip | null) => void
  format: (v: number) => string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const BAR_H = 14
  const GAP = 10
  const LABEL_W = 110
  const VALUE_W = 64
  const width = 440
  const plotW = width - LABEL_W - VALUE_W
  const height = rows.length * (BAR_H + GAP)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Horizontal bar chart"
      onMouseLeave={() => onHover(null)}
    >
      {rows.map((r, i) => {
        const y = i * (BAR_H + GAP)
        const w = Math.max((r.value / max) * plotW, 2)
        const radius = Math.min(4, w / 2)
        return (
          <g
            key={r.label}
            onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, text: `${r.label}: ${format(r.value)}` })}
          >
            {/* generous hit target */}
            <rect x={0} y={y - GAP / 2} width={width} height={BAR_H + GAP} fill="transparent" />
            <text
              x={LABEL_W - 8}
              y={y + BAR_H / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-current text-foreground"
              fontSize="11"
            >
              {r.label}
            </text>
            {/* baseline-anchored bar, rounded only at the data end */}
            <path
              d={`M ${LABEL_W} ${y}
                  h ${w - radius}
                  a ${radius} ${radius} 0 0 1 ${radius} ${radius}
                  v ${BAR_H - 2 * radius}
                  a ${radius} ${radius} 0 0 1 ${-radius} ${radius}
                  h ${-(w - radius)} z`}
              fill={r.color}
            />
            <text
              x={LABEL_W + w + 8}
              y={y + BAR_H / 2}
              dominantBaseline="central"
              className="fill-current text-muted-foreground"
              fontSize="11"
            >
              {r.value}
              {r.suffix ? ` · ${r.suffix}` : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Stacked daily sentiment columns with 2px surface gaps between segments. */
function SentimentBars({
  days,
  onHover,
}: {
  days: { day: string; positive: number; neutral: number; negative: number }[]
  onHover: (t: Tip | null) => void
}) {
  const width = 920
  const height = 160
  const PAD_BOTTOM = 18
  const plotH = height - PAD_BOTTOM
  const max = Math.max(...days.map((d) => d.positive + d.neutral + d.negative), 1)
  const slot = width / days.length
  const barW = Math.min(Math.max(slot * 0.55, 6), 28)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Stacked sentiment by day"
      onMouseLeave={() => onHover(null)}
    >
      {/* baseline */}
      <line x1={0} y1={plotH} x2={width} y2={plotH} stroke="currentColor" strokeOpacity={0.25} />
      {days.map((d, i) => {
        const total = d.positive + d.neutral + d.negative
        const x = i * slot + (slot - barW) / 2
        const label = d.day.slice(5)
        const showLabel = days.length <= 14 || i % Math.ceil(days.length / 10) === 0
        let yCursor = plotH
        const segs = (['positive', 'neutral', 'negative'] as const)
          .filter((s) => d[s] > 0)
          .map((s) => {
            const h = (d[s] / max) * (plotH - 8)
            yCursor -= h
            const y = yCursor
            yCursor -= 2 // 2px surface gap between stacked segments
            return { s, y, h }
          })
        return (
          <g
            key={d.day}
            onMouseMove={(e) =>
              onHover({
                x: e.clientX,
                y: e.clientY,
                text: `${d.day}: +${d.positive} / ±${d.neutral} / −${d.negative}`,
              })
            }
          >
            <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
            {segs.map(({ s, y, h }) => (
              <rect key={s} x={x} y={y} width={barW} height={Math.max(h, 1)} rx={2} fill={SENTIMENT_COLOR[s]} />
            ))}
            {total === 0 && <circle cx={x + barW / 2} cy={plotH - 3} r={1.5} fill="currentColor" opacity={0.2} />}
            {showLabel && (
              <text
                x={i * slot + slot / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="10"
                className="fill-current text-muted-foreground"
              >
                {label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function TableFallback({
  caption,
  headers,
  rows,
}: {
  caption: string
  headers: string[]
  rows: string[][]
}) {
  if (rows.length === 0) return null
  return (
    <details className="mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center rounded text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        View as table
      </summary>
      <table className="mt-2 w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="py-1.5 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((cell, j) => (
                <td key={j} className="py-1.5 pr-3 tabular-nums text-foreground/90">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
