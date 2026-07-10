# Octolens Clone — DeepSpace Showcase Build Plan

> **Purpose.** Build a full-featured **Octolens** clone (social listening / brand monitoring) on the **DeepSpace SDK**, as the first flagship "look how powerful this is" showcase app. This document is written to be opened cold in a **fresh build session**. Read it top to bottom once, then execute the phases in order.
>
> **Status:** ✅ ALL 10 PHASES SHIPPED (2026-07-09) — plus post-plan work the
> plan didn't foresee. This file is now a historical planning artifact;
> **current state, architecture, and TODOs live in [README.md](README.md).**
>
> **Post-plan addendum (what shipped beyond the phases):**
> - **UI/UX overhaul ×2** — first a ground-up console design (sidebar shell,
>   compact primitives), then a full light-theme redesign from a design
>   handoff (Hanken Grotesk + JetBrains Mono, indigo accent, Mentions
>   Table/Feed/Board modes, portal dropdowns, inset focus rings).
> - **Multi-tenant workspaces** — the plan's single shared team room became
>   real tenancy: a `workspaces` registry in the app room, one RecordRoom DO
>   per tenant (`ws:<id>`), a membership gate on `/ws/:roomId`, per-workspace
>   cron sweeps + job payloads + quota, workspace-bound API keys, workspace
>   switcher / onboarding / invites, and an isolation spec.
> - **Rebrand:** the product is now **Listenpost** (legal caution around the
>   Octolens name); deploy target moves to `listenpost.app.space`.
> - **TODO (next session):** per-customer **Slack OAuth** ("Connect Slack")
>   — see README §TODO for the full plan; the current single
>   `SLACK_BOT_TOKEN` wiring is demo-only. Also outstanding: Stripe checkout
>   verification (owner action), custom domain, MCP stretch goal.
>
> **Original target:** a deployed app at `octolens-clone.app.space` (pick your own subdomain) that reproduces every Octolens feature using DeepSpace primitives.

---

## 0. How to use this document

1. **The DeepSpace skill is your primary source of truth.** It is installed with every scaffolded app (`.claude/` + the `deepspace` skill). Load a reference doc when you reach its surface — do not front-load everything. The skill's own rule: *discover before you build* (`deepspace add --list`, `deepspace integrations list`), and *records are envelopes* (`r.data.title`, never `r.title`).
2. **When the skill is ambiguous or something behaves unexpectedly, drop to the SDK source.** The SDK lives at `/Users/yukewu/Desktop/deepspace-sdk/packages/deepspace/`. A subsystem-by-subsystem source map is in [§12 Reference index](#12-reference-index-skill--source). Read the `.d.ts` in `node_modules/deepspace/dist/*.d.ts` before guessing any hook/type signature — the skill says the same.
3. **Never invent integration endpoints.** Run `deepspace integrations list` and `deepspace integrations info <name>` to get exact two-segment endpoint keys. Endpoint strings in this plan are illustrative, not authoritative.
4. **Verify with `deepspace test` after any runtime-affecting change.** Collaborative features need a 2-user Playwright spec.
5. **Build order does not strictly matter** (the phases are mostly independent), but the order below is dependency-sane: data model → ingestion → AI → dashboard → more sources → delivery → data-layer API → analytics → billing → launch.

---

## Table of contents

- [1. What we're cloning](#1-what-were-cloning)
- [2. The core architectural insight](#2-the-core-architectural-insight)
- [3. Feature → DeepSpace primitive map](#3-feature--deepspace-primitive-map)
- [4. Honest constraints](#4-honest-constraints)
- [5. Data model (collections & schemas)](#5-data-model-collections--schemas)
- [6. Durable Object rooms](#6-durable-object-rooms)
- [7. The ingestion pipeline](#7-the-ingestion-pipeline)
- [8. Data sources — one by one](#8-data-sources--one-by-one)
- [9. Build phases (step by step)](#9-build-phases-step-by-step)
- [10. Getting started (commands)](#10-getting-started-commands)
- [11. Gotchas that will bite you](#11-gotchas-that-will-bite-you)
- [12. Reference index (skill + source)](#12-reference-index-skill--source)
- [13. Full feature checklist](#13-full-feature-checklist)

---

## 1. What we're cloning

Octolens is **AI keyword monitoring for buying intent**. You give it keywords (your brand, product features, competitors, pain points). It crawls 13+ web sources, uses AI to score each mention for relevance + sentiment + tags, and delivers them wherever you want (dashboard, Slack, email, webhooks, API, MCP). Pricing: Pro $159/mo (15k mentions), Scale $499/mo (50k mentions), overage per mention. Used by Vercel, PostHog, Supabase, Prisma.

**Their strategic pivot (important for our positioning):** they stopped selling the dashboard and rebuilt as a **data layer** — API/webhooks/MCP on every plan. Their own dashboard DAUs fell as revenue grew 5×.

**Sources (their 13+):** Reddit, X/Twitter, LinkedIn, Hacker News, GitHub, YouTube, TikTok, Bluesky, DEV, Stack Overflow, Product Hunt, newsletters, podcasts, news.

**AI layer:** relevance (High/Medium/Low, tuned by per-keyword "brand context" gathered at onboarding), sentiment (Positive/Negative/Neutral), auto-tags (`feature_request`, `bug_report`, `competitor_mention`), intent classification.

**Access methods:** REST API (`POST /api/v2/mentions`, Bearer auth, cursor pagination), webhooks (real-time, retry, filterable, Discord-compatible), MCP server (Claude/Cursor/Windsurf), dashboard, Slack routing (by sentiment/keyword/platform), email digests (real-time/daily/weekly).

**Mention schema (their API):** `id`, `source`, `body`, `author`, `url`, `timestamp`, `sentiment`, `relevance`, `tags[]`, `keywords[]` (matched, with IDs), `engagement_metrics`.

**Analytics:** trends by platform/sentiment/topic, share-of-voice vs competitors, chart export, historical viz.

---

## 2. The core architectural insight

Octolens is **two products stacked**:

1. **A data layer** — crawl the web, AI-filter, expose via API/webhooks/MCP. *This is their moat and the hard, external part.*
2. **An application layer** — dashboard, live feed, config, routing, team triage, analytics, billing.

**DeepSpace is world-class at #2 and does not provide #1** — but its **integrations + cron + jobs + AI** primitives can genuinely reproduce a credible #1 for the approachable sources.

**Our positioning edge:** Octolens *retreated* from the collaborative dashboard. That dashboard is *exactly* what DeepSpace is uniquely best at (real-time multiplayer sync + presence + RBAC). So this showcase should shine brightest where Octolens gave up: **a real-time, multiplayer mention-triage cockpit** — a whole team watching mentions stream in live, assigning/tagging/resolving together, with presence and per-role permissions. That is the demo that sells DeepSpace.

---

## 3. Feature → DeepSpace primitive map

| Octolens feature | DeepSpace primitive | Notes |
|---|---|---|
| Live mention feed streaming to the team | `RecordRoom` + `useQuery` live subscriptions | The hero demo. Mentions insert → all connected clients update instantly. |
| Multi-user triage (assign/tag/status), presence, roles | RBAC (`viewer`/`member`/`admin`) + `usePresence`/`usePresenceRoom` + records | DeepSpace's signature strength. |
| Keyword / monitor / brand-context config | records collection + schemas | `brand_context` text feeds the AI scorer. |
| AI relevance + sentiment + auto-tagging | `anthropic`/`openai` integration (or `createDeepSpaceAI`) run inside a **Job** on ingest | Per-keyword brand context in the prompt. |
| Crawl HN / Reddit / YouTube / GitHub / news / podcasts | **Cron** polling + integrations (`exa`,`serpapi`,`firecrawl`,`newsapi`,`youtube`,`github`) + free HN/Reddit APIs | See [§8](#8-data-sources--one-by-one). |
| Crawl **X / LinkedIn** (firehose) | *no clean legit source* | Partial coverage via `serpapi`/`exa` (Google-indexed public posts). Full firehose out of scope — see [§4](#4-honest-constraints). |
| Slack routing by sentiment/keyword/source | `slack` integration + `alert_rules` collection | |
| Email digests (real-time/daily/weekly) | `email` (Resend) integration + **Cron** | |
| Outbound webhooks with retry | **Jobs** (durable retry) + `webhook_endpoints` collection | |
| **Their** REST API / MCP data layer | app `/api/*` Hono routes + API-key middleware + AI agent tools / MCP endpoint | Mirrors DeepSpace's cross-app data-sharing philosophy. |
| Analytics / share-of-voice / trends | `useQuery` aggregates + charts (`deepspace add leaderboard` for SoV) | |
| Billing $159/$499 + per-mention overage | subscriptions (`src/subscriptions.ts`) + **metering** (`meterUsage`) | Overage = metered usage beyond plan quota. |
| Team chat / internal notes | `deepspace add messaging` and/or Yjs collaborative notes on a mention | Optional reuse. |
| In-app AI assistant ("what are people saying about X") | `deepspace add ai-chat` (ships `ChatPanel` + built-in record tools) | Doubles as the MCP-style natural-language query surface. |

---

## 4. Honest constraints

- **X (Twitter) and LinkedIn have no clean, legitimate ingestion path.** Official APIs are paid/restricted; scraping is gray-area and fragile. **Do not** promise a firehose. **Partial workaround:** `serpapi` and `exa` can surface *Google-indexed public* X/LinkedIn posts for a keyword — implement these as best-effort sources and label them as such in the UI. Full parity here is explicitly out of scope for the showcase.
- **TikTok / Bluesky / Stack Overflow / DEV / Product Hunt** are lower priority; add them opportunistically (Bluesky has a clean public API; Stack Overflow has a free API; DEV has an API; Product Hunt has a GraphQL API). None are blockers.
- **`APP_IDENTITY_TOKEN` is null until first deploy** — features that route through `/_deepspace/*` and scoped R2 (payments checkout, file uploads) can't be fully exercised purely locally. Plan to do a first deploy early (end of Phase 1) so these surfaces work.
- **Owner-pays integrations** (`exa`,`serpapi`,`firecrawl`,`newsapi`,`youtube`,`anthropic`,…) bill to the app owner via the proxy. For a public product, either gate ingestion behind a paid subscription (so we only crawl for paying customers) or set integration `billing: 'user'` where appropriate. Decide in Phase 9.
- **Cron/Jobs run as the app owner** (`APP_OWNER_JWT`), which is correct for background crawling — but means ingestion cost accrues to the platform account. Quota-enforce against the customer's plan inside the cron task.

---

## 5. Data model (collections & schemas)

One file per collection under `src/schemas/`, registered in `src/schemas.ts`. Columns only (no document mode). Keep the required `usersSchema` baseline. RBAC is per-role, per-collection, enforced server-side in the DO. Read `references/schemas.md`; if a permission level's semantics are unclear, read the source `packages/deepspace/src/server/schemas/registry.ts` (`checkPermissionLevel`).

> These are **design sketches** — translate to the real `CollectionSchema` shape from `references/schemas.md` / the starter's `src/schemas/users-schema.ts`. Use `interpretation:{kind:'json'}` for object/array columns (pass/read objects directly, don't stringify), and `{kind:'date'}` for timestamps.

### `keywords` — monitors
| column | type | notes |
|---|---|---|
| `term` | string | the keyword/phrase |
| `keyword_type` | string | `brand` \| `feature` \| `competitor` \| `pain_point` |
| `brand_context` | text | fed to the AI scorer for relevance tuning |
| `sources` | json | enabled source ids, e.g. `["hackernews","reddit","youtube"]` |
| `is_active` | bool | |
| `owner_field` | — | use RBAC `ownerField` so members manage their own keywords |

**RBAC:** `member` → create/update/delete `own`; `admin` → all; `viewer` → read.

### `mentions` — the core object
| column | type | notes |
|---|---|---|
| `source` | string | `hackernews`,`reddit`,`youtube`,`github`,`news`,`podcast`,`web`,`x`,`linkedin`,… |
| `source_id` | string | native id **for dedupe** (unique per source) |
| `keyword_id` | string | ref to `keywords` (or `keyword_ids` json for multi-match) |
| `author` | string | |
| `author_url` | string | |
| `url` | string | link to original |
| `title` | string | |
| `body` | text | full text |
| `published_at` | date | |
| `fetched_at` | date | |
| `relevance` | string | `high`\|`medium`\|`low`\|`pending` |
| `relevance_score` | number | 0–1, for thresholding |
| `sentiment` | string | `positive`\|`negative`\|`neutral`\|`pending` |
| `tags` | json | `["feature_request","competitor_mention",…]` |
| `engagement` | json | source-specific (points, comments, likes) |
| `status` | string | `new`\|`assigned`\|`resolved`\|`ignored` |
| `assigned_to` | string | `userBound` field for assignment |
| `notes` | text | internal triage notes (or Yjs field for collaborative notes) |

**RBAC:** `read: 'team'` (whole team sees the feed); `member` → update (triage: status/assignee/tags/notes); `create` server-only (written by cron/jobs via privileged path — no client create). **Dedupe** on `(source, source_id)` before insert.

### `alert_rules` — routing
`name`, `match` (json: `{sources?, sentiment?, relevance_min?, keyword_ids?, tags?}`), `channel` (`slack`\|`email`\|`webhook`), `target` (json: channel id / email / endpoint id), `is_active`.

### `webhook_endpoints`
`url`, `secret` (for HMAC signing), `filters` (json), `last_delivery_at`, `failure_count`, `is_active`.

### `api_keys` — for the data-layer API
`label`, `key_hash` (store a hash, never the raw key), `prefix` (first chars for display), `scopes` (json), `last_used_at`, `created_by`. **Never** store or log raw keys.

### `notification_targets` (Slack channels, emails)
`type` (`slack_channel`\|`email`), `label`, `config` (json), `is_active`.

### `digests`
`schedule` (`daily`\|`weekly`), `time`, `timezone`, `filters` (json), `target` (email/slack), `is_active`.

### Reused/built-in schemas
- `usersSchema` (required, keep `USERS_COLUMNS` baseline).
- `ai_chats` / `ai_messages` — from `deepspace add ai-chat` (keep `create:false` — do not relax).
- messaging schemas — from `deepspace add messaging` if we want team chat.

---

## 6. Durable Object rooms

The scaffold ships 6 DO classes in `__DO_MANIFEST__`. We use:

- **`AppRecordRoom` (RecordRoom)** — all collections above. The app's primary scope is `app:<APP_NAME>`.
- **`AppCronRoom` (CronRoom)** — the polling scheduler (see `src/cron.ts`). Tasks defined by `intervalMinutes` or 5-field cron `schedule` + IANA `timezone`.
- **`AppJobRoom` (JobRoom)** — durable background work: AI scoring, webhook delivery (with retry), digest sends. Handlers in `src/jobs.ts`.
- **`AppPresenceRoom` (PresenceRoom)** — live triage presence (who's viewing/typing on which mention). Optional but high-impact for the demo.
- **`AppYjsRoom`** — optional, for collaborative notes on a mention.
- `AppCanvasRoom` — unused (leave in manifest; harmless).

Keep the default manifest from the scaffold unless you need to add a room. Don't rename DO classes to reserved binding names.

---

## 7. The ingestion pipeline

The heart of the clone. Flow:

```
CronRoom task (every N min, runs as app owner)
  └─ for each active keyword × each enabled source:
       1. call the source (integration proxy OR direct fetch)
       2. get items since last cursor (store cursor per source/keyword)
       3. dedupe by (source, source_id) against existing mentions
       4. insert new mention rows: relevance=pending, sentiment=pending, status=new
       5. enqueue an AI-scoring job per new mention (or a batch job)
       6. increment usage meter (for overage billing)

JobRoom onJob('score-mention'):
  1. load mention + its keyword.brand_context
  2. call anthropic/chat-completion with a scoring prompt
       → { relevance, relevance_score, sentiment, tags[] }
  3. update the mention record  ← this live-syncs to every dashboard via RecordRoom
  4. evaluate alert_rules against the scored mention
  5. enqueue delivery jobs: 'deliver-slack' | 'deliver-webhook' (email handled by digest cron)

JobRoom onJob('deliver-webhook'):  POST to endpoint, HMAC-sign, retry with backoff, bump failure_count
JobRoom onJob('deliver-slack'):    slack integration post to the configured channel
```

**Key mechanics to resolve from source/skill (don't guess):**
- **How cron/job handlers read & write records.** Cron/job handlers receive a context (`buildCronContext` / job `ctx`) with tools to query/create/update records *as the app* (bypassing user RBAC via the `X-App-Action` path). Read `references/cron.md`, `references/jobs.md`, and `references/server-actions.md`. If the context tool surface is unclear, read source: `packages/deepspace/src/server/rooms/cron-room.ts`, `job-room.ts`, and `packages/deepspace/src/server/handlers/` + `src/server/index.ts` (server actions / `ActionTools`).
- **Calling integrations from the worker/cron/job.** `import { integration } from 'deepspace'` → `integration.post('<int>/<endpoint>', body)`. Confirm exact endpoint keys with `deepspace integrations info <name>`. For the AI scorer you can alternatively use `createDeepSpaceAI(env, provider, {authToken})` (Vercel AI SDK provider) — read `references/ai-chat.md`.
- **Cursors / incremental polling.** Store `last_polled` / `last_seen_id` per (source, keyword) — either a `sources_state` collection or a field on `keywords`. Dedupe is the safety net regardless.
- **Quota enforcement.** Before inserting, check the owner/customer plan's monthly mention quota (see [§9 Phase 9](#phase-9--monetization)); meter overage with `meterUsage`. Read `references/bindings.md` for metering.

---

## 8. Data sources — one by one

Confirm every integration endpoint with `deepspace integrations info <name>`. Direct-fetch sources (HN, Reddit, Bluesky, etc.) are plain `fetch()` from the cron/job — Workers allow arbitrary egress; no proxy needed, no owner billing.

| Source | Mechanism | Auth | Notes / difficulty |
|---|---|---|---|
| **Hacker News** | Direct fetch: Algolia HN Search API `http://hn.algolia.com/api/v1/search_by_date?query=<kw>` | none | **Start here (Phase 2).** Free, no auth, keyword search + timestamps. |
| **Reddit** | Direct fetch: Reddit OAuth API `/search` | script-app client id/secret | Store creds as app-internal secrets in `.dev.vars` **below the divider** (ship as prod secrets on deploy). Rate-limited. |
| **YouTube** | `youtube` integration | owner-pays proxy | search + comments. |
| **GitHub** | `github` integration | proxy | search issues/discussions/code. |
| **News** | `newsapi` integration | proxy | article search by keyword. |
| **Podcasts / newsletters** | RSS direct fetch + parse; discover feeds via `exa`/`firecrawl` | none / proxy | Podcast Index API is another free option. |
| **Broad web** | `exa` (neural search) and/or `firecrawl` (scrape) | proxy | Catches blogs, forums, misc. |
| **X / LinkedIn (partial)** | `serpapi` / `exa` over Google-indexed public posts | proxy | Best-effort only; label as partial. No firehose. |
| **Bluesky** | Direct fetch: public AT Protocol API | none/app-password | Clean, easy — good "extra source" win. |
| **Stack Overflow / DEV / Product Hunt** | Direct fetch: their public APIs | app key / none | Opportunistic. |

**Recommended source rollout:** HN (P2) → Reddit + YouTube + GitHub + News (P5) → podcasts/RSS + exa/serpafi broad web (P5) → Bluesky/SO/DEV/PH (opportunistic) → X/LinkedIn partial last.

---

## 9. Build phases (step by step)

Each phase is independently shippable and ends with a verification step. `deepspace test` after runtime-affecting changes; collaborative features get a 2-user spec.

### Phase 0 — Scaffold & foundations
- `npm create deepspace@latest octolens-clone` (pick the real subdomain name; canonical `^[a-z0-9][a-z0-9-]*$`).
- `cd`, `npx deepspace login`, `npx deepspace dev` → confirm `localhost:5173` renders.
- Set `src/constants.ts` (`APP_NAME`), theme (`src/themes.ts`/`themes.css`), nav (`src/nav.ts`).
- Discover reusable UI: `npx deepspace add --list`. Strong candidates: `topbar`, `sidebar`, `search-bar`, `admin-page`, `landing`, `kanban` (triage board), `leaderboard` (share-of-voice), `messaging` (team chat), `ai-chat` (assistant/MCP surface).
- **Verify:** app boots, you're logged in (`deepspace whoami --json`).

### Phase 1 — Data model
- Author `keywords` and `mentions` schemas ([§5](#5-data-model-collections--schemas)); register in `src/schemas.ts`.
- Build a minimal keywords CRUD page (`src/pages/`) using `useQuery`/`useMutations`.
- **Do a first deploy now** (`npx deepspace deploy`) so `APP_IDENTITY_TOKEN` gets minted (unblocks payments/files later).
- **Verify:** create a keyword; confirm it round-trips (remember `r.data.term`, not `r.term`). Check schema-lint warnings in the dev log — treat privacy warnings as errors.

### Phase 2 — Ingestion (Hacker News first)
- `src/cron.ts`: a task (`intervalMinutes: 5`) that, for each active keyword, fetches HN Algolia, dedupes on `(source, source_id)`, and inserts `mentions` rows (`relevance:'pending'`).
- Wire `AppCronRoom.onTask` and `buildCronContext` (read `references/cron.md`; source `cron-room.ts` if stuck).
- **Verify:** add keyword "durable objects" → within 5 min, HN mentions appear live in a raw list. Use `useCronMonitor` to trigger manually instead of waiting.

### Phase 3 — AI scoring pipeline
- `src/jobs.ts`: `score-mention` handler → `anthropic/chat-completion` (or `createDeepSpaceAI`) with a prompt that takes `body` + keyword `brand_context` → returns `{relevance, relevance_score, sentiment, tags[]}`; update the mention.
- Enqueue a scoring job from the cron insert step (`enqueueJob`).
- **Verify:** ingested mentions flip from `pending` → scored live in the UI; relevance/sentiment/tags look sane; brand_context changes the scores.

### Phase 4 — Real-time triage dashboard (the hero)
- The main feed: `useQuery('mentions', {where, orderBy:'published_at', orderDir:'desc'})` with filters (source, sentiment, relevance, status, keyword).
- Triage actions: assign (`assigned_to`), tag, set status (`new`/`assigned`/`resolved`/`ignored`), notes. Consider `deepspace add kanban` for a board view (columns = status).
- **Presence:** `usePresenceRoom` to show who's viewing/typing on a mention (live cursors/avatars).
- **RBAC:** viewer (read), member (triage), admin (config). Set via `useUsers().setRole`.
- **Verify:** **2-user Playwright spec** — user A resolves a mention, user B sees it update instantly; presence shows both. This is the money demo.

### Phase 5 — More sources
- Add Reddit (OAuth creds in `.dev.vars`), YouTube, GitHub, News integrations; podcast/newsletter RSS; broad web via `exa`/`serpapi`; X/LinkedIn partial via `serpapi`. One source per commit, each behind the keyword's `sources` toggle.
- **Verify:** per-source ingestion; source filter in the feed works; dedupe holds across sources.

### Phase 6 — Outbound delivery
- `alert_rules` collection + config UI.
- Slack: `slack` integration; route by rule → `deliver-slack` job.
- Email digests: `email` (Resend) integration + a digest cron (`daily`/`weekly`, timezone-aware) that queries matching mentions and sends.
- Outbound webhooks: `webhook_endpoints` + `deliver-webhook` job with HMAC signing, retry/backoff, `failure_count`. (Discord-compatible = just a webhook URL.)
- **Verify:** create a rule "negative sentiment → Slack #alerts"; trigger a matching mention; confirm delivery. Webhook retry survives a failing endpoint.

### Phase 7 — The data layer (Octolens's actual product)
- **REST API:** add Hono routes in `worker.ts` — `POST /api/v2/mentions` matching Octolens's schema (`filters.sources`, `filters.sentiment`, `limit`, `nextCursor`). Auth via `api_keys` (Bearer token; verify against `key_hash`). Cursor pagination over the mentions table.
- **API key management UI:** generate key (show raw once), store hash, list/revoke, `last_used_at`.
- **MCP (advanced/stretch):** expose an MCP endpoint so customers' agents (Claude/Cursor) can query mentions in natural language. This is the trickiest piece — read the **`agents-sdk`** skill (Cloudflare Agents SDK supports MCP servers on Workers) and the **`claude-api`** skill for tool-use shape. The in-app `ai-chat` (Phase 0) already gives a natural-language query surface over records via built-in tools; the external MCP server is the customer-facing version of that.
- **Verify:** `curl` the API with a Bearer key returns filtered JSON + `nextCursor`; revoked key → 401. MCP: connect from Claude Desktop and ask "what are people saying about X".

### Phase 8 — Analytics
- Share-of-voice (brand vs competitor keyword counts), sentiment-over-time, volume-by-source, top mentions. Query `mentions` with aggregates; render charts (follow the **`dataviz`** skill for palette/chart standards). `deepspace add leaderboard` can back SoV.
- **Verify:** charts match the underlying record counts; time-range filter works.

### Phase 9 — Monetization
- `src/subscriptions.ts`: tiers mirroring Octolens — **Pro** ($159/mo, 15k mentions) and **Scale** ($499/mo, 50k mentions); optionally a free trial (5k mentions). Read `references/payments.md` — **never hand-roll Stripe**.
- **Overage metering:** count scored mentions per customer per month; `meterUsage` for mentions beyond plan quota ($0.013 Pro / $0.01 Scale). Enforce/soft-cap quota inside the cron insert step so we don't crawl unboundedly for free users.
- `<PricingTable>` + `useSubscription()` gates; server-side `requireSubscription({atLeast})` on ingestion/API. Gate on **entitlement**, never a bare tier string.
- **Verify:** subscribe in test mode; quota + overage counter increments; gated features unlock. (Payments need the app deployed — done in P1.)

### Phase 10 — Polish & launch
- Onboarding flow (gather business/brand context like Octolens does → seed keyword `brand_context`).
- Landing page (`deepspace add landing`; follow the landing-design reference).
- Custom domain (`deepspace domain search/buy/attach`).
- Full test suite (`deepspace test all`), then `npx deepspace deploy`.
- **Verify:** end-to-end on the live `.app.space` (and custom domain): sign up → add keyword → mentions crawl in → AI-scored → triaged by a team → routed to Slack → queried via API.

---

## 10. Getting started (commands)

```bash
# scaffold (installs the deepspace skill + starts background npm install)
npm create deepspace@latest octolens-clone
cd octolens-clone

npx deepspace login            # browser OAuth (PKCE). DO NOT wrap in timeout/kill; let it finish.
npx deepspace whoami --json    # canonical login check
npx deepspace dev              # Vite + Cloudflare plugin @ localhost:5173, HMR

# discovery (no auth needed) — DO THIS BEFORE WRITING FEATURES
npx deepspace add --list               # reusable feature scaffolds
npx deepspace integrations list        # available data sources
npx deepspace integrations info exa    # exact endpoint keys for a source
npx deepspace integrations info anthropic
npx deepspace integrations info slack

# add reusable pieces (examples)
npx deepspace add ai-chat
npx deepspace add kanban
npx deepspace add messaging

# verify & ship
npx deepspace test             # smoke + api by default; `test all` for everything
npx deepspace deploy           # → https://octolens-clone.app.space
```

**Preview in Claude:** the scaffolder seeds `.claude/launch.json`; use `preview_start` with the app name. If working in a git worktree, run `deepspace dev` once inside it first (registers a `wt-<name>` launch entry) — see the worktree trap in [§11](#11-gotchas-that-will-bite-you).

---

## 11. Gotchas that will bite you

Pulled from the SDK investigation — these are the exact wrong turns to avoid.

- **Records are envelopes.** Read `r.data.title`, never `r.title`. `put(id, patch)` server-merges a `Partial<T>`.
- **Identity comes only from the verified JWT.** The worker strips `userId`/`role`/etc. from WS URLs and `/api/*` headers. **Never** build your own WS URL with `userId=…`; it's ignored.
- **RBAC is the security boundary and it's server-side in the DO.** Never rely on client-side filtering alone. AI chat write-tools rely entirely on RBAC — keep `create:false` on the AI chat schemas.
- **`APP_IDENTITY_TOKEN` is null until first deploy** → `/_deepspace/*` (subscriptions/charges) and scoped file uploads 401 locally. Deploy once early (Phase 1).
- **Pages live only in `src/pages/`** (generouted scans only there). A page under `src/features/` 404s.
- **Toast comes from local UI, not the SDK.** Import `useToast`/`ToastProvider` from `@/components/ui` (or `../components/ui`), *not* from `deepspace` — the SDK import throws at runtime. Extend the `_app.tsx` provider stack; don't replace it.
- **Never invent integration endpoints.** Two-segment keys only, confirmed via `deepspace integrations info`.
- **Deploy subdomain = wrangler `name`, not the folder.** Non-canonical names hard-fail `dev`/`deploy`. Never copy `.dev.vars` between apps (`APP_OWNER_JWT` is app-specific).
- **App-internal secrets** (Reddit creds, etc.) go **below the divider** in `.dev.vars` — preserved across dev/test, shipped as prod `secret_text` on deploy. **No `wrangler secret put`.** Never read `.dev.vars` values into output/PRs/screenshots; confirm by key name only.
- **Rules-of-Hooks lint fails the deploy build** (vite-plugin-checker). Fix hook violations even if your editor didn't flag them.
- **`--env staging` inherits almost nothing** — repeat `vars`/`durable_objects`/`migrations`/bindings in `[env.staging]`, and inject `APP_NAME` per-env into the client bundle or staging talks to the prod room.
- **Port 5173 sharing** — `reuseExistingServer:true` means a sibling session silently serves its app to your tests. Use `--port`.
- **Don't wrap `deepspace login` / `domain buy` in `timeout`/`sleep`/`kill`** — it aborts the OAuth/checkout the human must finish.
- **`runMigrations` splits SQL naively on `;`** — avoid semicolons inside string literals in D1 migrations.

---

## 12. Reference index (skill + source)

For each subsystem: **load the skill reference first**; drop to the SDK source only when the skill is ambiguous or behavior surprises you. Skill refs live in `/Users/yukewu/Desktop/deepspace-skill/skills/deepspace/`. Source lives in `/Users/yukewu/Desktop/deepspace-sdk/packages/deepspace/`.

| Subsystem | Skill reference | SDK source (when stuck) |
|---|---|---|
| Overall model, scopes, security | `SKILL.md`, `references/architecture.md` | — |
| Records / queries / mutations | `references/sdk-reference.md` | `src/server/handlers/{records,subscriptions}.ts`, `src/client/storage/` |
| Schemas / RBAC | `references/schemas.md` | `src/server/schemas/registry.ts` (`checkPermissionLevel`, `lintSchema`) |
| DO rooms / manifest | `references/architecture.md` | `src/server/rooms/{base-room,record-room,do-manifest}.ts` |
| Cron | `references/cron.md` | `src/server/rooms/cron-room.ts`, starter `src/cron.ts` |
| Jobs | `references/jobs.md` | `src/server/rooms/job-room.ts`, starter `src/jobs.ts` |
| Server actions (privileged writes) | `references/server-actions.md` | `src/server/handlers/`, `src/server/index.ts` (`ActionTools`) |
| Integrations | `references/integrations.md` + `assets/integrations/*.yaml` | resolve endpoints via `deepspace integrations info <name>` |
| AI / one-shot LLM / chat | `references/ai-chat.md` | `src/server/utils/` (`createDeepSpaceAI`) |
| Auth | `references/auth.md` | `src/server/auth/`, `src/client/auth/` |
| Payments / subscriptions / metering | `references/payments.md`, `references/bindings.md` | `src/server/{subscription,refunds}.ts`, `src/client/{subscriptions,charges}/` |
| Custom bindings / provisioning / metering | `references/bindings.md` | deploy-worker `lib/cloudflare-provision.ts` (behavior) |
| Custom API routes / worker plumbing | `references/architecture.md` | `packages/create-deepspace/templates/starter/worker.ts` |
| Presence / Yjs / Canvas | `references/sdk-reference.md` | `src/server/rooms/{presence,yjs,canvas}-room.ts` |
| MCP / agent server (data layer) | `agents-sdk` skill, `claude-api` skill | Cloudflare Agents SDK docs |
| Data-viz / charts | `dataviz` skill | — |
| CLI / deploy / domain / preview / testing | `references/{cli,deploy,domain,preview,testing}.md` | `src/cli/commands/*` |
| Reusable feature scaffolds | `deepspace add --list` / `--info` | `packages/deepspace/features/*/feature.json` |

**Golden rule:** if a hook or type isn't documented, read its declaration in `node_modules/deepspace/dist/*.d.ts` — do not guess.

---

## 13. Full feature checklist

Clone = cover all of these. Tick as you go.

**Monitoring & ingestion**
- [ ] Keyword/monitor CRUD with type (brand/feature/competitor/pain-point) + brand context
- [ ] Hacker News ingestion
- [ ] Reddit ingestion
- [ ] YouTube ingestion
- [ ] GitHub ingestion
- [ ] News ingestion
- [ ] Podcasts / newsletters (RSS)
- [ ] Broad web (exa/firecrawl)
- [ ] X / LinkedIn partial (serpapi/exa) — labeled best-effort
- [ ] Bluesky / Stack Overflow / DEV / Product Hunt (opportunistic)
- [ ] Dedupe + incremental cursors per source
- [ ] Per-plan mention quota enforcement

**AI layer**
- [ ] Relevance scoring (high/med/low + score) with per-keyword brand context
- [ ] Sentiment (positive/negative/neutral)
- [ ] Auto-tags (feature_request / bug_report / competitor_mention / …)
- [ ] Intent classification

**Application layer**
- [ ] Real-time live mention feed
- [ ] Filters (source / sentiment / relevance / status / keyword)
- [ ] Multi-user triage (assign / tag / status / notes)
- [ ] Presence (who's viewing/typing)
- [ ] RBAC (viewer / member / admin)
- [ ] Kanban board view (optional)
- [ ] In-app AI assistant (natural-language queries over mentions)
- [ ] Onboarding (gather brand context)

**Delivery / data layer**
- [ ] Slack routing by rule
- [ ] Email digests (real-time / daily / weekly)
- [ ] Outbound webhooks (retry, HMAC, Discord-compatible)
- [ ] REST API (`POST /api/v2/mentions`, Bearer, cursor pagination, Octolens schema)
- [ ] API key management (generate/revoke, hashed storage)
- [ ] MCP server (stretch)

**Analytics**
- [ ] Trends by platform / sentiment / topic
- [ ] Share-of-voice vs competitors
- [ ] Sentiment over time
- [ ] Chart export

**Monetization & launch**
- [ ] Subscription tiers (Pro $159 / Scale $499 / trial)
- [ ] Per-mention overage metering
- [ ] Pricing table + entitlement gating
- [ ] Landing page
- [ ] Custom domain
- [ ] Full test suite (incl. 2-user collab spec)
- [ ] Production deploy + end-to-end verification

---

*Plan authored from a four-agent investigation of the DeepSpace SDK, platform workers, developer flow, and skill references, cross-referenced with Octolens's public features / API / launch materials. Build order is dependency-sane but phases are largely independent — reorder as convenient.*
