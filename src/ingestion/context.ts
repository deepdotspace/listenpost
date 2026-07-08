/**
 * Minimal env/context types for ingestion code.
 *
 * cron.ts and jobs.ts can't import the `Env` interface from worker.ts
 * (worker.ts imports them — circular). This narrow structural type carries
 * just what the pipeline needs; the real Env satisfies it.
 */

export interface IngestEnv {
  APP_NAME: string
  OWNER_USER_ID: string
  APP_OWNER_JWT?: string
  JOB_ROOMS: DurableObjectNamespace
  RECORD_ROOMS: DurableObjectNamespace
  API_WORKER?: Fetcher
  API_WORKER_URL?: string
}

/** Matches the CronContext returned by buildCronContext (deepspace/worker). */
export interface CronContext {
  records: {
    query(collection: string, opts?: { where?: Record<string, unknown>; limit?: number }): Promise<any[]>
    create(collection: string, data: Record<string, unknown>): Promise<any>
    update(collection: string, recordId: string, data: Record<string, unknown>): Promise<any>
    delete(collection: string, recordId: string): Promise<any>
  }
  integrations: {
    call(endpoint: string, params?: Record<string, unknown>): Promise<any>
  }
  ownerUserId: string
}
