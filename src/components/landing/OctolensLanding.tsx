/**
 * Design Direction
 *
 * Product: Octolens watches 13+ web sources for your brand, features,
 *   competitors, and pain points, AI-scores every mention for relevance,
 *   sentiment, and intent, and streams the verdicts to your team — dashboard,
 *   Slack, webhooks, or raw API.
 * Emotion: the jolt of catching your product's name on Hacker News while the
 *   thread is still hot — being first into the conversation instead of
 *   reading about it in next Monday's report.
 * Metaphor: a radar scope in a dark operations room — a quiet sweep, and
 *   blips that light up already classified: friend, foe, buying intent.
 * References (outside the category): an air-traffic-control console's calm
 *   density; a seismograph drum that never sleeps; the departures board at a
 *   train station — rows of live, terse, trustworthy signal.
 * Signature: the hero IS the product — a live feed mockup where mention rows
 *   stream in from real sources and their "scoring…" badges flip to AI
 *   verdicts (high · negative · churn_risk) with a routed-to-Slack receipt.
 * Hero: within 5 seconds a HN row slides in, its badge flips from scoring…
 *   to a verdict, a "→ #alerts" receipt stamps on, and the next row arrives.
 *
 * Style Tile
 * - Color: midnight navy background, soft off-white foreground, one sky-blue
 *   primary for verdicts and CTAs. Zero gradients.
 * - Type: app sans for headlines (dense, tight tracking); mono for source
 *   tags, timestamps, and verdict badges — the signal layer speaks mono.
 * - Theme: dark — monitoring consoles live in dim rooms.
 * - Art direction: technical minimalism; departures-board density, no
 *   decoration, whitespace measured not generous.
 * - Motion: instrument-like — rows slide in linearly, badges snap, one slow
 *   radar pulse behind the hero. Nothing bounces.
 * - Voice: second person; declarative; short lines; no exclamation points.
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
  verdict: { relevance: string; sentiment: string; tag: string }
  routed?: string
}

const FEED_SCRIPT: FeedEvent[] = [
  {
    source: 'hackernews',
    author: 'jkwon',
    text: 'Anyone tried Octolens for brand monitoring? Evaluating it vs. rolling our own.',
    verdict: { relevance: 'high', sentiment: 'positive', tag: 'buying_intent' },
    routed: '#buying-signals',
  },
  {
    source: 'reddit',
    author: 'r/devtools',
    text: 'Their webhook alerts have been flaky for weeks. Actively looking at alternatives.',
    verdict: { relevance: 'high', sentiment: 'negative', tag: 'churn_risk' },
    routed: '#alerts',
  },
  {
    source: 'bluesky',
    author: '@maren.dev',
    text: 'wrote up how we track competitor launches with keyword monitors — link below',
    verdict: { relevance: 'medium', sentiment: 'neutral', tag: 'competitor_mention' },
  },
]

const ROW_INTERVAL_MS = 2600
const SCORE_DELAY_MS = 1100

function LiveFeed() {
  const reduce = useReducedMotion()
  const [visible, setVisible] = useState(reduce ? FEED_SCRIPT.length : 0)
  const [scored, setScored] = useState(reduce ? FEED_SCRIPT.length : 0)

  useEffect(() => {
    if (reduce) return
    if (visible < FEED_SCRIPT.length) {
      const t = setTimeout(() => setVisible((n) => n + 1), visible === 0 ? 500 : ROW_INTERVAL_MS)
      return () => clearTimeout(t)
    }
  }, [visible, reduce])

  useEffect(() => {
    if (reduce) return
    if (scored < visible) {
      const t = setTimeout(() => setScored((n) => n + 1), SCORE_DELAY_MS)
      return () => clearTimeout(t)
    }
  }, [scored, visible, reduce])

  return (
    <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          live feed
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-primary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          listening
        </span>
      </div>
      <div className="p-4 space-y-3 min-h-[340px]">
        {FEED_SCRIPT.slice(0, visible).map((ev, i) => {
          const isScored = i < scored
          return (
            <motion.div
              key={ev.source + ev.author}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'linear' }}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                  {ev.source}
                </span>
                <span className="text-muted-foreground">{ev.author}</span>
                <span className="ml-auto">
                  {isScored ? (
                    <span className="text-primary">
                      {ev.verdict.relevance} · {ev.verdict.sentiment} · {ev.verdict.tag}
                    </span>
                  ) : (
                    <span className="text-muted-foreground animate-pulse">scoring…</span>
                  )}
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground leading-snug">{ev.text}</p>
              {isScored && ev.routed && (
                <motion.div
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-2 font-mono text-[11px] text-muted-foreground"
                >
                  ✓ routed → <span className="text-foreground">{ev.routed}</span>
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
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Radar className="w-4 h-4 text-primary" aria-hidden />
            octolens
          </span>
          <nav className="hidden md:flex items-center gap-6 font-mono text-[13px]">
            <a href="#sources" className="text-muted-foreground hover:text-foreground transition-colors">
              sources
            </a>
            <a href="#pipeline" className="text-muted-foreground hover:text-foreground transition-colors">
              pipeline
            </a>
            <a href="#api" className="text-muted-foreground hover:text-foreground transition-colors">
              api
            </a>
            <button
              onClick={() => navigate('/pricing')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              pricing
            </button>
          </nav>
        </div>
        <button
          onClick={() => navigate('/mentions')}
          className="font-mono text-[13px] font-medium text-primary hover:text-primary/80"
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
    <section className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 grid md:grid-cols-[1fr_1.2fr] gap-10 items-center">
      <div aria-hidden className="pointer-events-none absolute -top-20 left-1/4 h-[360px] w-[360px] rounded-full bg-primary/10 blur-[100px]" />
      <div className="relative">
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-4xl md:text-5xl font-semibold text-foreground leading-[1.08] tracking-tight"
        >
          Every mention. Scored. Routed. Live.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-5 text-muted-foreground max-w-md leading-relaxed"
        >
          Octolens watches 13+ sources for your keywords, judges every hit
          against your brand context, and streams the verdicts to your team
          while the thread is still hot.
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <button
            onClick={() => navigate('/keywords')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Start monitoring
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/mentions')}
            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            or watch the live feed →
          </button>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative"
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
    <section id="sources" className="border-y border-border bg-muted py-20">
      <div className="max-w-6xl mx-auto px-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">sources</span>
        <h2 className="mt-2 text-3xl font-semibold text-foreground tracking-tight">
          One feed. Thirteen listening posts.
        </h2>
        <div className="mt-10 flex flex-wrap gap-2.5">
          {SOURCES.map((s) => (
            <span
              key={s.id}
              title={STATUS_LABEL[s.status]}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[12px] text-foreground"
            >
              <span
                className={
                  s.status === 'live'
                    ? 'h-1.5 w-1.5 rounded-full bg-primary'
                    : s.status === 'metered'
                      ? 'h-1.5 w-1.5 rounded-full bg-primary/50'
                      : 'h-1.5 w-1.5 rounded-full border border-primary/60'
                }
              />
              {s.id}
            </span>
          ))}
        </div>
        <p className="mt-6 font-mono text-[11px] text-muted-foreground">
          ● free api · ◐ metered · ○ partial (google-indexed posts only — no firehose promises)
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
    snippet: `keyword: "octolens"
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
    <section id="pipeline" className="max-w-6xl mx-auto px-6 py-24 space-y-14">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">pipeline</span>
        <h2 className="mt-2 text-3xl font-semibold text-foreground tracking-tight">
          Keyword in. Verdict out.
        </h2>
      </div>
      {STEPS.map((step) => (
        <div
          key={step.label}
          className="grid md:grid-cols-[auto_1fr_1.2fr] gap-6 md:gap-10 items-start"
        >
          <span className="font-mono text-5xl text-primary/80">{step.label}</span>
          <div>
            <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm">{step.body}</p>
          </div>
          <pre className="rounded-md border border-border bg-card p-4 overflow-x-auto text-[12px] font-mono text-foreground leading-relaxed">
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
    <section id="api" className="border-y border-border bg-muted py-24">
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">data layer</span>
          <h2 className="mt-2 text-3xl font-semibold text-foreground tracking-tight">
            The dashboard is optional.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
            Every scored mention is yours over a REST API with cursor
            pagination, signed webhooks with retry, and Slack routing. Build
            on the feed; skip the UI.
          </p>
          <button
            onClick={() => navigate('/api-keys')}
            className="mt-6 inline-flex items-center gap-2 font-mono text-[13px] text-primary hover:text-primary/80"
          >
            get an api key →
          </button>
        </div>
        <pre className="rounded-md border border-border bg-card p-5 overflow-x-auto text-[12px] font-mono text-foreground leading-relaxed">
          <code>{`$ curl -X POST https://octolens-clone.app.space/api/v2/mentions \\
    -H "Authorization: Bearer olk_..." \\
    -d '{ "filters": { "sentiment": ["negative"] }, "limit": 25 }'

{
  "data": [ { "id": "…", "source": "hackernews",
              "relevance": "high", "sentiment": "negative",
              "tags": ["churn_risk"], … } ],
  "nextCursor": "eyJvZmZzZXQiOjI1fQ"
}`}</code>
        </pre>
      </div>
    </section>
  )
}

// ── CTA band ─────────────────────────────────────────────────────────────────

function CTA() {
  const navigate = useNavigate()
  return (
    <section className="bg-foreground text-background">
      <div className="max-w-4xl mx-auto px-6 py-20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight">
            Someone is talking about you right now.
          </h2>
          <p className="mt-2 opacity-70 font-mono text-sm">Add a keyword. See the first mentions in minutes.</p>
        </div>
        <button
          onClick={() => navigate('/keywords')}
          className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-md bg-background text-foreground text-sm font-medium"
        >
          Start monitoring
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  const navigate = useNavigate()
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        <span>octolens · a deepspace showcase · © {new Date().getFullYear()}</span>
        <span className="flex items-center gap-6">
          <button onClick={() => navigate('/pricing')} className="hover:text-foreground">
            pricing
          </button>
          <button onClick={() => navigate('/api-keys')} className="hover:text-foreground">
            api
          </button>
        </span>
      </div>
    </footer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OctolensLanding() {
  return (
    <MotionConfig reducedMotion="user">
      <div data-testid="landing-page" className="min-h-screen bg-background text-foreground">
        <TopBar />
        <Hero />
        <Sources />
        <Pipeline />
        <DataLayer />
        <CTA />
        <Footer />
      </div>
    </MotionConfig>
  )
}
