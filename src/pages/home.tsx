/**
 * Home — product front door. A fuller marketing landing ships in Phase 10;
 * this page states what the product does and routes people into the app.
 */

import { useAuthProfileReady } from 'deepspace'
import { Link } from 'react-router-dom'
import { ArrowRight, Radar, Bot, Users, Webhook } from 'lucide-react'

const FEATURES = [
  {
    icon: Radar,
    title: '13+ sources, one feed',
    body: 'Hacker News, Reddit, YouTube, GitHub, news, podcasts and more — every mention of your keywords streams into a single live feed.',
  },
  {
    icon: Bot,
    title: 'AI relevance & sentiment',
    body: 'Every mention is scored for relevance against your brand context, tagged, and classified by sentiment before you ever see it.',
  },
  {
    icon: Users,
    title: 'Team triage, live',
    body: 'Assign, tag, and resolve mentions together in real time — with presence, roles, and instant sync across the whole team.',
  },
  {
    icon: Webhook,
    title: 'Your data, anywhere',
    body: 'REST API, outbound webhooks, Slack routing, and email digests. The feed goes wherever your workflow lives.',
  },
] as const

export default function HomePage() {
  const { isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const greet = isSignedIn && !userLoading && !!user

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <BackgroundDecor />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
        <section className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <Radar className="h-3.5 w-3.5 text-primary" aria-hidden />
            AI keyword monitoring for buying intent
          </span>

          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            {greet ? (
              <>
                Welcome back,{' '}
                <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
                  {user?.name?.split(' ')[0] ?? 'friend'}
                </span>
              </>
            ) : (
              <>
                Know the moment the internet{' '}
                <span className="bg-gradient-to-br from-primary via-primary to-foreground bg-clip-text text-transparent">
                  talks about you
                </span>
              </>
            )}
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            Octolens watches the web for your brand, features, competitors, and
            pain points — AI-scores every mention, and streams them to your team
            in real time.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/keywords"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-card transition-all hover:opacity-90 hover:shadow-card-hover"
            >
              {greet ? 'Manage keywords' : 'Start monitoring'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/mentions"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur-md transition-colors hover:bg-card"
            >
              Open the live feed
            </Link>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
              />
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/20">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-base font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}

function BackgroundDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 h-[260px] w-[460px] rounded-full bg-primary/10 blur-[100px]" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
          color: 'var(--color-foreground)',
        }}
      />
    </div>
  )
}
