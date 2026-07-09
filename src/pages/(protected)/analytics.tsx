/**
 * Analytics — light-theme redesign (Stripe / Linear grade).
 * KPI row, a two-tone Mention-volume chart (Bar / Line / Area, pure SVG +
 * divs), a Sentiment split, and labeled Top-sources / Top-keywords bars.
 * Every number is derived from the existing `mentions` / `keywords` queries;
 * the data layer and all `data-testid`s are untouched.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from 'deepspace'
import { Download } from 'lucide-react'
import { EmptyState, cn } from '@/components/ui'
import { PageHeader } from '../../components/PageHeader'
import type { Keyword, Mention } from '../../types'

// Light-theme source hues (all ≥3:1 on white, distinct under CVD). Fallback = accent.
const SOURCE_COLOR: Record<string, string> = {
  hackernews: '#f97316',
  reddit: '#ef4444',
  bluesky: '#2563eb',
  twitter: '#0ea5e9',
  x: '#0ea5e9',
  github: '#6366f1',
  youtube: '#dc2626',
  mastodon: '#8b5cf6',
  linkedin: '#0a66c2',
  stackoverflow: '#d97706',
  devto: '#5a616b',
}
const ACCENT = 'var(--color-primary)'
const NEUTRAL_SENTIMENT = '#cbd0d8'

const RANGES = [
  { id: 7, label: 'Last 7 days', short: '7d' },
  { id: 30, label: 'Last 30 days', short: '30d' },
  { id: 90, label: 'Last 90 days', short: '90d' },
]

const CHART_TYPES = ['bar', 'line', 'area'] as const
type ChartType = (typeof CHART_TYPES)[number]

const DAY_MS = 86_400_000
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function AnalyticsPage() {
  const { records: mentions, status } = useQuery<Mention>('mentions', {
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 1000,
  })
  const { records: keywords } = useQuery<Keyword>('keywords', { limit: 100 })
  const [rangeDays, setRangeDays] = useState(30)
  const [chartType, setChartType] = useState<ChartType>('bar')

  const windowed = useMemo(() => {
    const since = Date.now() - rangeDays * DAY_MS
    return (mentions ?? []).filter((r) => new Date(r.createdAt).getTime() >= since)
  }, [mentions, rangeDays])

  // Previous equal-length window — powers the honest, derivable Mentions delta.
  const prevCount = useMemo(() => {
    const now = Date.now()
    const start = now - 2 * rangeDays * DAY_MS
    const end = now - rangeDays * DAY_MS
    return (mentions ?? []).filter((r) => {
      const t = new Date(r.createdAt).getTime()
      return t >= start && t < end
    }).length
  }, [mentions, rangeDays])

  const scored = windowed.filter((r) => r.data.relevance !== 'pending')

  // ── aggregates ────────────────────────────────────────────────────────────
  const bySource = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of windowed) counts.set(r.data.source, (counts.get(r.data.source) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [windowed])

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

  const sentiment = useMemo(() => {
    let positive = 0
    let neutral = 0
    let negative = 0
    for (const r of windowed) {
      const s = r.data.sentiment
      if (s === 'positive') positive++
      else if (s === 'neutral') neutral++
      else if (s === 'negative') negative++
    }
    return { positive, neutral, negative, total: positive + neutral + negative }
  }, [windowed])

  // Daily volume buckets: total + high-relevance share (capped at 30 days for legibility).
  const volumeByDay = useMemo(() => {
    const n = Math.min(rangeDays, 30)
    const buckets = new Map<string, { total: number; high: number }>()
    const days: string[] = []
    for (let i = n - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10)
      buckets.set(key, { total: 0, high: 0 })
      days.push(key)
    }
    for (const r of windowed) {
      const key = new Date(r.createdAt).toISOString().slice(0, 10)
      const b = buckets.get(key)
      if (b) {
        b.total++
        if (r.data.relevance === 'high') b.high++
      }
    }
    return days.map((day) => ({ day, ...buckets.get(day)! }))
  }, [windowed, rangeDays])

  const total = windowed.length
  const negatives = scored.filter((r) => r.data.sentiment === 'negative').length
  const highRelevance = scored.filter((r) => r.data.relevance === 'high').length
  const mentionsDelta =
    prevCount > 0
      ? { up: total >= prevCount, text: `${Math.abs(Math.round(((total - prevCount) / prevCount) * 100))}%` }
      : undefined

  // Test-critical: tiles labeled "Mentions" and "Negative" carry raw counts as the
  // 2nd <p>. Median response time isn't in the data model, so the 4th KPI is the
  // derivable, honestly-labeled Negative count.
  const kpis: { label: string; value: string; delta?: { up: boolean; text: string } }[] = [
    { label: 'Mentions', value: total.toLocaleString(), delta: mentionsDelta },
    { label: 'High relevance', value: `${pct(highRelevance, scored.length)}%` },
    { label: 'Positive sentiment', value: `${pct(sentiment.positive, sentiment.total)}%` },
    { label: 'Negative', value: String(negatives) },
  ]

  function exportCsv() {
    const rows: string[][] = [
      ['metric', 'value'],
      ...kpis.map((k) => [k.label, k.value.replace(/,/g, '')]),
      [],
      ['source', 'mentions'],
      ...bySource.map(([s, c]) => [s, String(c)]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${rangeDays}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const maxSource = Math.max(...bySource.map(([, c]) => c), 1)
  const maxKeyword = Math.max(...shareOfVoice.map((k) => k.count), 1)

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Analytics"
        meta={<span>Last {rangeDays} days</span>}
        actions={
          <>
            <div
              data-testid="range-filter"
              className="flex items-center gap-0.5 rounded-lg border border-border bg-panel p-0.5"
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
                    'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors',
                    rangeDays === r.id
                      ? 'bg-background text-foreground shadow-card'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.short}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export
            </button>
          </>
        }
      />

      <div className="flex-1 px-4 py-4 sm:px-6">
        {status !== 'loading' && windowed.length === 0 && (
          <div className="mb-4 rounded-xl border border-border">
            <EmptyState
              title="No data in this window"
              description="Mentions will show up here as they're ingested."
            />
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stat-tiles">
          {kpis.map((k) => (
            <StatTile key={k.label} label={k.label} value={k.value} delta={k.delta} />
          ))}
        </div>

        {/* Volume + sentiment */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-xl border border-border bg-background p-4 shadow-card sm:p-[18px]">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <h2 className="text-[13px] font-semibold text-foreground">Mention volume</h2>
                <div className="hidden items-center gap-2.5 text-[11px] text-tertiary sm:flex">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px] bg-primary" />
                    Total
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px] border border-primary/25 bg-primary/[0.08]" />
                    High relevance
                  </span>
                </div>
              </div>
              <div className="inline-flex shrink-0 rounded-lg border border-border bg-panel p-0.5">
                {CHART_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setChartType(t)}
                    aria-pressed={chartType === t}
                    className={cn(
                      'h-6 rounded-md px-2.5 text-[11.5px] font-medium capitalize transition-colors',
                      chartType === t
                        ? 'bg-background text-foreground shadow-card'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <VolumeChart data={volumeByDay} type={chartType} />

            <div className="mt-2 flex justify-between font-mono text-[10px] tabular-nums text-tertiary">
              {volumeByDay.length > 0 && (
                <>
                  <span>{fmtShort(volumeByDay[0].day)}</span>
                  <span>{fmtShort(volumeByDay[Math.floor(volumeByDay.length / 2)].day)}</span>
                  <span>{fmtShort(volumeByDay[volumeByDay.length - 1].day)}</span>
                </>
              )}
            </div>
          </section>

          <section
            data-testid="chart-sentiment"
            className="rounded-xl border border-border bg-background p-4 shadow-card sm:p-[18px]"
          >
            <h2 className="mb-4 text-[13px] font-semibold text-foreground">Sentiment split</h2>
            {sentiment.total === 0 ? (
              <p className="text-[13px] text-muted-foreground">No sentiment-scored mentions yet.</p>
            ) : (
              <>
                <div className="mb-[18px] flex h-2.5 overflow-hidden rounded-full">
                  <div
                    className="bg-success"
                    style={{ width: `${(sentiment.positive / sentiment.total) * 100}%` }}
                  />
                  <div
                    style={{
                      width: `${(sentiment.neutral / sentiment.total) * 100}%`,
                      backgroundColor: NEUTRAL_SENTIMENT,
                    }}
                  />
                  <div
                    className="bg-destructive"
                    style={{ width: `${(sentiment.negative / sentiment.total) * 100}%` }}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { key: 'positive', n: sentiment.positive, color: 'var(--color-success)' },
                    { key: 'neutral', n: sentiment.neutral, color: NEUTRAL_SENTIMENT },
                    { key: 'negative', n: sentiment.negative, color: 'var(--color-destructive)' },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="flex-1 text-[12.5px] capitalize text-muted-foreground">
                        {row.key}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">
                        {pct(row.n, sentiment.total)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        {/* Top sources + top keywords */}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section
            data-testid="chart-sources"
            className="rounded-xl border border-border bg-background p-4 shadow-card sm:p-[18px]"
          >
            <h2 className="mb-3.5 text-[13px] font-semibold text-foreground">Top sources</h2>
            {bySource.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No data.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {bySource.slice(0, 6).map(([source, count]) => (
                  <LabeledBar
                    key={source}
                    label={source}
                    value={String(count)}
                    frac={count / maxSource}
                    color={SOURCE_COLOR[source] ?? ACCENT}
                    labelClass="w-[86px] shrink-0 font-mono text-muted-foreground"
                    barClass="flex-1"
                  />
                ))}
              </div>
            )}
            <TableFallback
              caption="Volume by source"
              headers={['Source', 'Mentions']}
              rows={bySource.map(([s, c]) => [s, String(c)])}
            />
          </section>

          <section
            data-testid="chart-sov"
            className="rounded-xl border border-border bg-background p-4 shadow-card sm:p-[18px]"
          >
            <h2 className="mb-3.5 text-[13px] font-semibold text-foreground">Top keywords</h2>
            {shareOfVoice.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No keyword-attributed mentions yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {shareOfVoice.slice(0, 6).map((k) => (
                  <LabeledBar
                    key={k.term}
                    label={k.term}
                    value={String(k.count)}
                    frac={k.count / maxKeyword}
                    color={ACCENT}
                    labelClass="flex-1 font-medium text-foreground"
                    barClass="w-[120px] shrink-0"
                  />
                ))}
              </div>
            )}
            <TableFallback
              caption="Share of voice"
              headers={['Keyword', 'Type', 'Mentions', 'Share']}
              rows={shareOfVoice.map((k) => [k.term, k.type, String(k.count), `${Math.round(k.share * 100)}%`])}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta?: { up: boolean; text: string }
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3.5 shadow-card">
      <p className="text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {value}
        </p>
        {delta && (
          <span
            className={cn(
              'text-[11.5px] font-semibold tabular-nums',
              delta.up ? 'text-success' : 'text-destructive',
            )}
          >
            {delta.up ? '▲' : '▼'} {delta.text}
          </span>
        )}
      </div>
    </div>
  )
}

/** Bar / Line / Area volume chart — pure divs + SVG, no chart lib. */
function VolumeChart({
  data,
  type,
}: {
  data: { day: string; total: number; high: number }[]
  type: ChartType
}) {
  const maxTotal = Math.max(...data.map((d) => d.total), 1)

  if (type === 'bar') {
    return (
      <div className="flex h-[150px] items-end gap-1.5">
        {data.map((d) => {
          const totalH = (d.total / maxTotal) * 100
          const highH = (d.high / maxTotal) * 100
          const restH = Math.max(totalH - highH, 0)
          return (
            <div
              key={d.day}
              className="flex h-full flex-1 flex-col justify-end gap-0.5"
              title={`${fmtShort(d.day)} · ${d.total} mentions, ${d.high} high relevance`}
            >
              <div className="w-full rounded-t-[3px] bg-primary" style={{ height: `${restH}%` }} />
              <div
                className="w-full rounded-b-[3px] bg-primary/[0.08]"
                style={{ height: `${highH}%` }}
              />
            </div>
          )
        })}
      </div>
    )
  }

  // Line / Area — non-scaling stroke inside a stretched viewBox.
  const cW = 560
  const cH = 150
  const pad = 14
  const denom = Math.max(data.length - 1, 1)
  const project = (val: number, i: number): [number, number] => [
    +((i / denom) * cW).toFixed(1),
    +(cH - (val / maxTotal) * (cH - pad * 2) - pad).toFixed(1),
  ]
  const totalPts = data.map((d, i) => project(d.total, i))
  const highPts = data.map((d, i) => project(d.high, i))
  const toStr = (a: [number, number][]) => a.map((p) => `${p[0]},${p[1]}`).join(' ')
  const areaPath = totalPts.length
    ? `M ${totalPts[0][0]},${cH} ${totalPts.map((p) => `L ${p[0]},${p[1]}`).join(' ')} L ${
        totalPts[totalPts.length - 1][0]
      },${cH} Z`
    : ''

  return (
    <svg
      viewBox={`0 0 ${cW} ${cH}`}
      preserveAspectRatio="none"
      className="block h-[150px] w-full overflow-visible"
      role="img"
      aria-label="Mention volume over time"
    >
      {type === 'area' && <path d={areaPath} stroke="none" style={{ fill: ACCENT, fillOpacity: 0.08 }} />}
      {type === 'line' && (
        <polyline
          points={toStr(highPts)}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: ACCENT, strokeOpacity: 0.3 }}
        />
      )}
      <polyline
        points={toStr(totalPts)}
        fill="none"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ stroke: ACCENT }}
      />
    </svg>
  )
}

/** Labeled horizontal bar: track = bg-accent, fill sized by fraction. */
function LabeledBar({
  label,
  value,
  frac,
  color,
  labelClass,
  barClass,
}: {
  label: string
  value: string
  frac: number
  color: string
  labelClass: string
  barClass: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('truncate text-[11.5px]', labelClass)} title={label}>
        {label}
      </span>
      <div className={cn('h-2 overflow-hidden rounded-full bg-accent', barClass)}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(frac * 100, 2)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
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
}): ReactNode {
  if (rows.length === 0) return null
  return (
    <details className="mt-4">
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
