/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; each fire is recorded in the DO's `cron_history` table and
 * pushed to subscribers over `/ws/cron/:roomId`.
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import { runIngestion } from './ingestion'
import type { IngestEnv } from './ingestion/context'

export const tasks: CronTask[] = [
  // Low-cost liveness probe — the cron e2e spec asserts against its history.
  { name: 'heartbeat', intervalMinutes: 1 },
  // Poll every active keyword × enabled source for new mentions.
  { name: 'poll-sources', intervalMinutes: 5 },
]

export async function runTask(name: string, env: unknown): Promise<void> {
  if (name === 'heartbeat') return // liveness only; the DO records the run

  const e = env as IngestEnv
  const ctx = buildCronContext(e, e.OWNER_USER_ID, `app:${e.APP_NAME}`)

  if (name === 'poll-sources') {
    await runIngestion(ctx, e)
  }
}
