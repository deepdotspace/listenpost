# Listenpost

> AI keyword monitoring for buying intent — a full-featured social-listening
> product built on the [DeepSpace SDK](https://www.npmjs.com/package/deepspace)
> as its flagship showcase app.
>
> **Live:** https://listenpost.app.space

You give it keywords (your brand, features, competitors, pain points). It
crawls 9 web sources, AI-scores every mention for relevance, sentiment, and
intent against your per-keyword brand context, and streams the verdicts to
your team — a real-time multiplayer triage dashboard, Slack routing, email
digests, HMAC-signed webhooks, and a REST data API.

## Product surfaces

| Surface | Where | Notes |
|---|---|---|
| Live mention feed (Table / Feed / Board) | `/mentions` | Real-time sync, presence, per-row triage (status / assign / notes) |
| Analytics | `/analytics` | KPI tiles, volume (bar/line/area), sentiment split, top sources/keywords |
| AI assistant | `/assistant` | Streamed chat with record tools over the caller's workspace |
| Keywords / monitors | `/keywords` | Term + type + brand context + per-source toggles |
| Delivery | `/alerts` | Alert rules → Slack/webhook, email digests, webhook endpoints (HMAC + retry) |
| Data API | `/api-keys` | `POST /api/v2/mentions`, Bearer keys (hash-stored, shown once), cursor pagination |
| Billing | `/pricing` | Trial $0 (1k mentions, 2 keywords) · Pro $79 (15k, 5) · Scale $239 (50k, 20), metered overage — priced at cost + ~25-30% margin |
| Landing | `/` | Public marketing page (light theme, live scored-feed hero) |

## Architecture

DeepSpace app on Cloudflare Workers. Everything runs in per-app Durable
Objects; schemas live in `src/schemas/` and are baked in at deploy.

### Multi-tenant workspaces (2026-07-09)

Each customer team gets a **workspace**; all product data is tenant-scoped:

```
app:<APP_NAME> room (registry)        ws:<workspaceId> rooms (one per tenant)
├── users (global identities)         ├── keywords, mentions, sources_state
├── workspaces ← membership registry  ├── alert_rules, webhook_endpoints
├── api_keys (workspace_id-bound)     ├── notification_targets, digests
└── settings                          └── ai_chats / ai_messages
```

- **Security boundary:** the worker's `/ws/:roomId` route refuses `ws:*`
  connections unless the JWT subject is the workspace owner (→ room admin)
  or in `member_ids` (→ member). Resolver: `src/server/workspace-access.ts`.
- **Client:** nested `RecordScope`s with disjoint schema sets
  (`src/workspace-schemas.ts`) — tenant collections resolve to the inner
  `ws:` scope, registry collections fall through to the app scope.
  `WorkspaceProvider` owns selection (localStorage), create, invite-by-email,
  member removal; onboarding creates the first workspace.
- **Pipeline:** the cron sweeps every active workspace (`poll-sources` every
  5 min, `send-digests` every 15); job payloads carry `workspaceId` so
  scoring/delivery read + write the right room. The mention quota and the
  per-plan active-keyword cap both resolve against the workspace owner's
  subscription tier (the owner is the payer).
- **Lifecycle:** workspace deletion is owner-only with a type-the-name
  confirm; the `deleteWorkspace` action removes the registry row, then a
  `purge-workspace` job wipes every tenant-room collection.
- **Data API:** keys are bound to one workspace at generation; the API
  resolves key-hash → workspace → that tenant's room.
- **AI chat:** all `/api/ai/*` calls require `x-workspace-id` (membership
  verified server-side), so the assistant only sees the caller's tenant.

### Ingestion pipeline

```
keyword created  → sweepKeyword action → sweep-keyword job (immediate first
                   crawl — no waiting for the next cron tick)
CronRoom (per workspace, every 5 min)
  active keywords (per-plan cap, oldest-first) × enabled sources
  → fetch since cursor → dedupe (source, source_id)
  → insert mentions (relevance: pending) → enqueue score-mention job
  → orphan sweep: purge mentions whose keyword no longer exists
JobRoom: score-mention → anthropic (haiku) with brand context
  → { relevance, score, sentiment, tags } → live-sync to every dashboard
  → evaluate alert rules → deliver-slack / deliver-webhook (HMAC, retry)
keyword deleted  → purgeKeyword action (inline) + purge-keyword job
                   (mentions + cursors; queued scoring jobs skip unbilled)
```

Sources: Hacker News (Algolia, 30-day first-poll backfill), Reddit, Bluesky,
YouTube, GitHub, News, broad web via Exa; X/LinkedIn best-effort via search
index (labeled partial). Free APIs poll every tick; metered integrations run
on a slower cadence.

## Development

```sh
npx deepspace dev --port 5174    # dev server (login required: deepspace whoami)
npx deepspace test all --port 5174
npx deepspace deploy             # → <wrangler name>.app.space
scripts/seed-demo.sh <workspaceId> [port]   # demo mentions into a tenant room
```

Testing notes:
- Suite is serial (`workers: 1`); signed-in specs call
  `ensureWorkspace(page)` (tests/helpers/workspace.ts) so they land in a
  tenant. Multi-user specs seed a shared workspace via debug SQL.
- `tests/isolation.spec.ts` is the tenancy security spec — A's data must be
  invisible to B, including a forced-selection socket attempt.
- Debug SQL can target a tenant room: `POST /api/debug/sql?room=ws:<id>`
  (dev-only route).
- Live-prod specs: `npx playwright test --config tests/live.config.ts`.

## TODO

- [ ] **Slack OAuth — per-customer "Connect Slack"**.
      Today Slack delivery uses a single app-wide `SLACK_BOT_TOKEN`, which
      only ever posts to OUR workspace — not usable by real customers.
      Plan (no SDK changes needed):
      1. One vendor Slack app at api.slack.com/apps (any home workspace —
         it's just the config home; install it there once, then enable
         **public distribution**; no Slack review needed unless we want the
         Marketplace). Bot scopes: `chat:write`, `channels:read`, optionally
         `chat:write.public`. Redirect URL:
         `https://listenpost.app.space/api/slack/oauth/callback`.
      2. `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in `.dev.vars` below the
         divider (ships as prod secrets on deploy).
      3. App-side: `/api/slack/oauth/start` + `/callback` routes,
         `slack_connections` collection (per workspace, admin-read-only),
         "Connect Slack" button + channel picker on `/alerts`,
         `deliver-slack` job reads the workspace's stored token and posts
         via direct `fetch` to Slack's API ($0/message — skip the proxy).
- [ ] Stripe test-mode checkout verification through the pay wall + Stripe
      Connect onboarding at /earnings (owner action).
- [ ] Custom domain (`deepspace domain search/buy/attach`) — deferred.
- [ ] MCP server for the data layer (plan stretch goal).

## Repo map

```
worker.ts                  Hono worker: WS routes (+ tenant gate), data API, auth proxy
src/schemas/               Collection schemas + RBAC (workspaces registry included)
src/server/                workspace-access resolver (shared worker/chat)
src/ingestion/             Source fetchers + per-tenant pipeline + quota
src/cron.ts, src/jobs.ts   Workspace sweep, scoring + delivery jobs
src/components/            AppShell, WorkspaceProvider, ChatPanel, UI kit
src/pages/                 File-based routes (generouted); (protected)/ is auth-gated
tests/                     Playwright suite (16 specs: smoke, api, collab,
                           isolation, keyword lifecycle/cap, workspace delete,
                           webhooks, live-prod) + vitest unit tests in tests/unit
OCTOLENS-CLONE-PLAN.md     Original build plan (historical) + status addendum
```
