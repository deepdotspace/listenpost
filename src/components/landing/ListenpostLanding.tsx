/**
 * Listenpost landing — light "operations console" redesign.
 *
 * Product: Listenpost watches 13+ web sources for your brand, features,
 *   competitors, and pain points, AI-scores every mention for relevance,
 *   sentiment, and intent, and streams the verdicts to your team — dashboard,
 *   Slack, webhooks, or raw API.
 * Signature: the hero IS the product — a live feed mockup where mention rows
 *   stream in from real sources and their "scoring…" badges flip to AI
 *   verdicts (high · positive · buying_intent) with a routed-to-Slack receipt.
 *
 * Style: crisp light theme (Stripe / Linear grade). Sans headlines, mono for
 *   the "signal layer" (source tags, timestamps, verdicts, code, nav). One
 *   indigo accent for verdicts and CTAs. Zero gradients.
 *
 * Presentation-only re-skin of the previous dark version — the `landing-page`
 * testid, the hero headline, and the "Start monitoring" CTA are preserved.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Radar } from 'lucide-react'

// ── Signature element: live scored feed ─────────────────────────────────────

interface FeedEvent {
  source: string
  author: string
  text: string
  verdict: string
  routed?: string
}

const FEED_SCRIPT: FeedEvent[] = [
  {
    source: 'hackernews',
    author: 'jkwon',
    text: 'Anyone tried Listenpost for brand monitoring? Evaluating it vs. rolling our own.',
    verdict: 'high · positive · buying_intent',
    routed: '#buying-signals',
  },
  {
    source: 'reddit',
    author: 'r/devtools',
    text: 'Their webhook alerts have been flaky for weeks. Actively looking at alternatives.',
    verdict: 'high · negative · churn_risk',
    routed: '#alerts',
  },
  {
    source: 'bluesky',
    author: '@maren.dev',
    text: 'wrote up how we track competitor launches with keyword monitors — link below',
    verdict: 'medium · neutral · competitor_mention',
  },
]

// Reveal at 450ms, then +2400ms per row; each row scores 1100ms after it lands.
const REVEAL_DELAY_MS = 450
const ROW_INTERVAL_MS = 2400
const SCORE_DELAY_MS = 1100

function LiveFeed() {
  const reduce = useReducedMotion()
  const [visible, setVisible] = useState(reduce ? FEED_SCRIPT.length : 0)
  const [scored, setScored] = useState(reduce ? FEED_SCRIPT.length : 0)

  useEffect(() => {
    if (reduce) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let n = 1; n <= FEED_SCRIPT.length; n++) {
      const revealAt = REVEAL_DELAY_MS + ROW_INTERVAL_MS * (n - 1)
      timers.push(setTimeout(() => setVisible(n), revealAt))
      timers.push(setTimeout(() => setScored(n), revealAt + SCORE_DELAY_MS))
    }
    return () => timers.forEach(clearTimeout)
  }, [reduce])

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-background shadow-[0_20px_50px_-20px_rgba(20,22,40,0.22),0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border bg-panel px-4 py-[11px]">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-tertiary">
          live feed
        </span>
        <span className="flex items-center gap-[7px] font-mono text-[10px] text-primary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-50 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          listening
        </span>
      </div>
      <div className="flex min-h-[344px] flex-col gap-3 p-4">
        {FEED_SCRIPT.slice(0, visible).map((ev, i) => {
          const isScored = i < scored
          return (
            <motion.div
              key={ev.source + ev.author}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="rounded-[11px] border border-border bg-background px-[13px] py-3"
            >
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="rounded-[5px] border border-input px-1.5 py-0.5 text-muted-foreground">
                  {ev.source}
                </span>
                <span className="text-tertiary">{ev.author}</span>
                <span className="ml-auto">
                  {isScored ? (
                    <span className="font-semibold text-primary">{ev.verdict}</span>
                  ) : (
                    <span className="animate-pulse text-tertiary">scoring…</span>
                  )}
                </span>
              </div>
              <p className="mt-[9px] text-[13px] leading-[1.45] text-foreground">{ev.text}</p>
              {isScored && ev.routed && (
                <motion.div
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-[9px] font-mono text-[11px] text-tertiary"
                >
                  ✓ routed → <span className="font-semibold text-primary">{ev.routed}</span>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function TopBar() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-[58px] max-w-[1120px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="flex items-center gap-[9px] text-[15px] font-bold tracking-[-0.02em]">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-primary">
              <Radar className="h-[15px] w-[15px] text-primary-foreground" strokeWidth={2.2} aria-hidden />
            </span>
            Listenpost
          </span>
          <nav className="hidden items-center gap-[26px] font-mono text-[13px] md:flex">
            <a href="#sources" className="text-muted-foreground transition-colors hover:text-foreground">
              sources
            </a>
            <a href="#pipeline" className="text-muted-foreground transition-colors hover:text-foreground">
              pipeline
            </a>
            <a href="#api" className="text-muted-foreground transition-colors hover:text-foreground">
              api
            </a>
            <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">
              pricing
            </a>
          </nav>
        </div>
        <button
          onClick={() => navigate('/mentions')}
          className="font-mono text-[13px] font-semibold text-primary transition-opacity hover:opacity-80"
        >
          open app →
        </button>
      </div>
    </header>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const navigate = useNavigate()
  return (
    <section className="mx-auto grid max-w-[1120px] items-center gap-14 px-6 pb-[88px] pt-20 md:grid-cols-[1fr_1.15fr]">
      <div>
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-[42px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground md:text-[52px]"
        >
          Every mention. Scored. Routed. <span className="text-primary">Live.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-[22px] max-w-[400px] text-[15.5px] leading-[1.6] text-muted-foreground"
        >
          Listenpost watches 13+ sources for your keywords, judges every hit
          against your brand context, and streams the verdicts to your team
          while the thread is still hot.
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-[30px] flex flex-wrap items-center gap-[18px]"
        >
          <button
            onClick={() => navigate('/keywords')}
            className="inline-flex items-center gap-2 rounded-[9px] bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
          >
            Start monitoring
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <a
            href="#pipeline"
            className="font-mono text-[12.5px] text-tertiary transition-colors hover:text-foreground"
          >
            or watch the live feed →
          </a>
        </motion.div>
        <div className="mt-[34px] flex items-center gap-[18px] font-mono text-[11px] text-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            13+ sources
          </span>
          <span>·</span>
          <span>AI relevance scoring</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Slack · webhooks · API</span>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <LiveFeed />
      </motion.div>
    </section>
  )
}

// ── Sources board ────────────────────────────────────────────────────────────

const SOURCES: Array<{ id: string; status: 'live' | 'metered' | 'partial' }> = [
  { id: 'hackernews', status: 'live' },
  { id: 'reddit', status: 'live' },
  { id: 'bluesky', status: 'live' },
  { id: 'stackoverflow', status: 'live' },
  { id: 'dev.to', status: 'live' },
  { id: 'rss / podcasts', status: 'live' },
  { id: 'youtube', status: 'metered' },
  { id: 'github', status: 'metered' },
  { id: 'news', status: 'metered' },
  { id: 'web (exa)', status: 'metered' },
  { id: 'x / twitter', status: 'partial' },
  { id: 'linkedin', status: 'partial' },
]

const STATUS_LABEL: Record<'live' | 'metered' | 'partial', string> = {
  live: 'free api, polled every 5 min',
  metered: 'metered integration, hourly',
  partial: 'best-effort via search index',
}

function Sources() {
  return (
    <section id="sources" className="border-y border-border bg-panel py-[76px]">
      <div className="mx-auto max-w-[1120px] px-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">sources</span>
        <h2 className="mt-2.5 text-[30px] font-bold tracking-[-0.02em] text-foreground">
          One feed. Thirteen listening posts.
        </h2>
        <div className="mt-[34px] flex flex-wrap gap-2.5">
          {SOURCES.map((s) => (
            <span
              key={s.id}
              title={STATUS_LABEL[s.status]}
              className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-[7px] font-mono text-[12px] text-foreground"
            >
              <span
                className={
                  s.status === 'live'
                    ? 'h-[7px] w-[7px] shrink-0 rounded-full bg-primary'
                    : s.status === 'metered'
                      ? 'h-[7px] w-[7px] shrink-0 rounded-full bg-primary/50'
                      : 'h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] border-primary/60'
                }
              />
              {s.id}
            </span>
          ))}
        </div>
        <p className="mt-[22px] font-mono text-[11px] text-tertiary">
          ● free api&nbsp;&nbsp;·&nbsp;&nbsp;◐ metered&nbsp;&nbsp;·&nbsp;&nbsp;○ partial (google-indexed
          posts only — no firehose promises)
        </p>
      </div>
    </section>
  )
}

// ── Pipeline (dense numbered rows, snippet per step) ─────────────────────────

const STEPS = [
  {
    label: '01',
    title: 'Teach it your brand.',
    body: 'A keyword plus two sentences of context. That context rides along in every scoring prompt.',
    snippet: `keyword: "listenpost"
type: brand
context: "We sell keyword monitoring
to devtools teams. Praise, bugs, and
competitor comparisons all matter."`,
  },
  {
    label: '02',
    title: 'AI reads every hit.',
    body: 'Relevance, sentiment, and intent — judged against your context, not generic keyword matching.',
    snippet: `{
  "relevance": "high",
  "relevance_score": 0.91,
  "sentiment": "negative",
  "tags": ["churn_risk", "bug_report"]
}`,
  },
  {
    label: '03',
    title: 'Verdicts go where you work.',
    body: 'Slack channels by rule. HMAC-signed webhooks. Email digests. Or your team triages together, live.',
    snippet: `rule: negative sentiment
  → slack #alerts
rule: buying_intent
  → webhook (signed, retried)
digest: weekly summary → email`,
  },
]

function Pipeline() {
  return (
    <section id="pipeline" className="mx-auto flex max-w-[1120px] flex-col gap-[52px] px-6 py-[88px]">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">pipeline</span>
        <h2 className="mt-2.5 text-[30px] font-bold tracking-[-0.02em] text-foreground">
          Keyword in. Verdict out.
        </h2>
      </div>
      {STEPS.map((step) => (
        <div
          key={step.label}
          className="grid items-start gap-6 md:grid-cols-[auto_1fr_1.15fr] md:gap-10"
        >
          <span className="font-mono text-[44px] font-semibold leading-none text-primary/25">
            {step.label}
          </span>
          <div>
            <h3 className="text-[19px] font-semibold text-foreground">{step.title}</h3>
            <p className="mt-[9px] max-w-[320px] text-[13.5px] leading-[1.6] text-muted-foreground">
              {step.body}
            </p>
          </div>
          <pre className="overflow-x-auto whitespace-pre rounded-[10px] border border-border bg-panel p-4 font-mono text-[12px] leading-[1.7] text-foreground">
            <code>{step.snippet}</code>
          </pre>
        </div>
      ))}
    </section>
  )
}

// ── Data layer ───────────────────────────────────────────────────────────────

function DataLayer() {
  const navigate = useNavigate()
  return (
    <section id="api" className="border-y border-border bg-panel py-[88px]">
      <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 md:grid-cols-2">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">data layer</span>
          <h2 className="mt-2.5 text-[30px] font-bold tracking-[-0.02em] text-foreground">
            The dashboard is optional.
          </h2>
          <p className="mt-4 max-w-[400px] text-[14px] leading-[1.6] text-muted-foreground">
            Every scored mention is yours over a REST API with cursor
            pagination, signed webhooks with retry, and Slack routing. Build
            on the feed; skip the UI.
          </p>
          <button
            onClick={() => navigate('/api-keys')}
            className="mt-[22px] inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold text-primary transition-opacity hover:opacity-80"
          >
            get an api key →
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre rounded-[11px] border border-border bg-background p-[18px] font-mono text-[12px] leading-[1.7] text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <code>
            <span className="text-tertiary">$</span>
            {' curl -X POST https://listenpost.app.space/api/v2/mentions \\\n    -H '}
            <span className="text-primary">"Authorization: Bearer lpk_..."</span>
            {` \\
    -d '{ "filters": { "sentiment": ["negative"] }, "limit": 25 }'

{
  "data": [ { "id": "…", "source": "hackernews",
              "relevance": "high", "sentiment": "negative",
              "tags": ["churn_risk"], … } ],
  "nextCursor": "eyJvZmZzZXQiOjI1fQ"
}`}
          </code>
        </pre>
      </div>
    </section>
  )
}

// ── Pricing ──────────────────────────────────────────────────────────────────

const PLANS: Array<{
  name: string
  price: string
  blurb: string
  quota: string
  overage: string
  recommended?: boolean
  cta: string
}> = [
  {
    name: 'Trial',
    price: '$0',
    blurb: 'Kick the tires on a real feed.',
    quota: '5,000',
    overage: 'hard cap — upgrade to keep ingesting',
    cta: 'Start trial',
  },
  {
    name: 'Pro',
    price: '$159',
    blurb: 'For teams monitoring a brand seriously.',
    quota: '15,000',
    overage: 'then $0.013 per extra mention',
    recommended: true,
    cta: 'Select Pro',
  },
  {
    name: 'Scale',
    price: '$499',
    blurb: 'High-volume brands and agencies.',
    quota: '50,000',
    overage: 'then $0.010 per extra mention',
    cta: 'Select Scale',
  },
]

function Pricing() {
  const navigate = useNavigate()
  return (
    <section id="pricing" className="mx-auto max-w-[1120px] px-6 py-[88px]">
      <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">pricing</span>
      <h2 className="mt-2.5 text-[30px] font-bold tracking-[-0.02em] text-foreground">
        Plans differ only in volume.
      </h2>
      <p className="mt-3 max-w-[460px] text-[14px] leading-[1.6] text-muted-foreground">
        Every plan includes the full data layer — dashboard, API, webhooks, Slack
        routing, and email digests.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={
              'flex flex-col rounded-[14px] bg-background p-[22px] transition-colors ' +
              (p.recommended
                ? 'border-[1.5px] border-primary/25 shadow-[0_10px_30px_-14px_rgba(79,70,229,0.33)]'
                : 'border border-border hover:border-input')
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-foreground">{p.name}</span>
              {p.recommended && (
                <span className="rounded-md border border-primary/25 bg-primary/[0.08] px-[7px] py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary">
                  Recommended
                </span>
              )}
            </div>
            <div className="mt-3.5 flex items-baseline gap-[5px]">
              <span className="text-[36px] font-bold tracking-[-0.03em] tabular-nums text-foreground">
                {p.price}
              </span>
              <span className="text-[12px] text-tertiary">/ month</span>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">{p.blurb}</p>
            <ul className="mt-4 flex list-none flex-col gap-2 border-t border-border pt-4 text-[13px] text-muted-foreground">
              <li>
                <span className="font-semibold tabular-nums text-foreground">{p.quota}</span> mentions /
                month
              </li>
              <li>{p.overage}</li>
            </ul>
            <button
              onClick={() => navigate('/pricing')}
              className={
                'mt-5 inline-flex h-[38px] items-center justify-center rounded-[9px] text-[13px] font-semibold transition-colors ' +
                (p.recommended
                  ? 'bg-primary text-primary-foreground hover:brightness-110'
                  : 'border border-input text-foreground hover:bg-secondary')
              }
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── CTA band ─────────────────────────────────────────────────────────────────

function CTA() {
  const navigate = useNavigate()
  return (
    <section className="bg-foreground text-background">
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-6 px-6 py-[72px]">
        <div>
          <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.02em]">
            Someone is talking about you right now.
          </h2>
          <p className="mt-2.5 font-mono text-[13px] opacity-60">
            Add a keyword. See the first mentions in minutes.
          </p>
        </div>
        <button
          onClick={() => navigate('/keywords')}
          className="inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-background px-[22px] py-[13px] text-[14px] font-semibold text-foreground transition-[filter] hover:brightness-95"
        >
          Start monitoring
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-6 font-mono text-[11px] uppercase tracking-[0.24em] text-tertiary">
        <span>listenpost · brand monitoring · © {new Date().getFullYear()}</span>
        <span className="flex items-center gap-6">
          <a href="#pricing" className="transition-colors hover:text-foreground">
            pricing
          </a>
          <a href="#api" className="transition-colors hover:text-foreground">
            api
          </a>
        </span>
      </div>
    </footer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ListenpostLanding() {
  return (
    <MotionConfig reducedMotion="user">
      <div data-testid="landing-page" className="min-h-screen bg-background text-[14px] text-foreground">
        <TopBar />
        <Hero />
        <Sources />
        <Pipeline />
        <DataLayer />
        <Pricing />
        <CTA />
        <Footer />
      </div>
    </MotionConfig>
  )
}
