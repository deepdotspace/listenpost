/**
 * Cron Log Page
 *
 * Subscribes to the app's CronRoom via `useCronMonitor` and renders live
 * task state + execution history. The DO is keyed by `app:${APP_NAME}` so
 * a single shared CronRoom DO instance backs the whole app — same pattern
 * as RecordRoom.
 *
 * Used both as a UI surface for verifying that scheduled tasks are firing
 * in production, and as the data source for the cron e2e spec at
 * tests/feature-tests/tests/cron.spec.ts.
 */

import { useCronMonitor } from 'deepspace'
import { cn } from '@/components/ui'
import { PageHeader, SectionLabel } from '../components/PageHeader'
import { SCOPE_ID } from '../constants'

const TH_CLASS =
  'border-b border-border px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'

export default function CronLogPage() {
  const { tasks, history, connected, canWrite, trigger } = useCronMonitor(SCOPE_ID)

  // Newest first.
  const sorted = [...history].sort((a, b) => {
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  })

  return (
    <div data-testid="cron-log-page" className="flex min-h-full flex-col">
      <PageHeader
        title="Crawler"
        meta={
          <span data-testid="cron-log-status" className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                connected ? 'bg-success' : 'bg-muted-foreground/40',
              )}
              aria-hidden
            />
            Connection: {connected ? 'live' : 'connecting…'}
          </span>
        }
      />

      <div className="flex-1 px-4 py-4 sm:px-6">
        <div className="space-y-6">
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            Each row is one tick of a scheduled task fired by the AppCronRoom DO. Heartbeat ticks
            every minute once the DO alarm picks up the registered config.
          </p>

          {/* Tasks */}
          <section className="space-y-2">
            <SectionLabel>Tasks</SectionLabel>
            <div className="overflow-x-auto rounded-lg border border-border bg-card/50">
              <table data-testid="cron-tasks" className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH_CLASS}>Name</th>
                    <th className={TH_CLASS}>Schedule</th>
                    <th className={TH_CLASS}>Last run</th>
                    <th className={TH_CLASS}>Next run</th>
                    {canWrite && <th className={TH_CLASS} />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map((task) => (
                    <tr key={task.name} data-testid="cron-task-row" data-task={task.name}>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-foreground">
                        {task.name}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                        {task.schedule
                          ? `${task.schedule} (${task.timezone ?? 'UTC'})`
                          : `every ${task.intervalMinutes ?? '?'} min`}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {task.lastRunAt ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {task.nextRunAt ?? '—'}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => trigger(task.name)}
                            className="inline-flex h-7 items-center whitespace-nowrap rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                          >
                            Run now: {task.name}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* History */}
          <section className="space-y-2">
            <div className="flex items-baseline gap-2">
              <SectionLabel>History</SectionLabel>
              <span data-testid="cron-log-count" className="text-[11.5px] text-muted-foreground">
                {sorted.length} entries
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-card/50">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH_CLASS}>Task</th>
                    <th className={TH_CLASS}>Started (UTC)</th>
                    <th className={TH_CLASS}>Duration</th>
                    <th className={TH_CLASS}>Outcome</th>
                  </tr>
                </thead>
                <tbody data-testid="cron-log-rows" className="divide-y divide-border">
                  {sorted.map((entry, idx) => (
                    <tr
                      key={`${entry.taskName}-${entry.startedAt}-${idx}`}
                      data-testid="cron-log-row"
                      data-task={entry.taskName}
                      data-success={entry.success ? '1' : '0'}
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] text-foreground">
                        {entry.taskName}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {entry.startedAt}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {entry.durationMs} ms
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 font-mono text-[11px]',
                          entry.success ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {entry.success ? 'ok' : `error: ${entry.error ?? '?'}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {sorted.length === 0 && connected && (
                <p
                  data-testid="cron-log-empty"
                  className="px-4 py-8 text-center text-[13px] text-muted-foreground"
                >
                  No cron ticks recorded yet. The first one should appear within ~90s of deploy.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
