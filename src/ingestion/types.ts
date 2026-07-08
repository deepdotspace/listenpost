/**
 * Ingestion plumbing shared by all source fetchers.
 *
 * A SourceFetcher pulls items for one (keyword, cursor) pair and returns
 * normalized NewMention drafts plus the next cursor. The pipeline in
 * index.ts handles dedupe, inserts, cursor persistence, and job enqueue —
 * fetchers only speak HTTP to their source.
 */

import type { CronContext } from './context'
import type { Mention } from '../types'

/** A mention draft before insert — pipeline fills relevance/status defaults. */
export type NewMention = Omit<Mention, 'relevance' | 'sentiment' | 'status'>

export interface FetchResult {
  items: NewMention[]
  /** Opaque cursor persisted to sources_state.last_seen_id. */
  nextCursor?: string
}

export interface SourceFetcher {
  /** Matches keywords.sources entries and mentions.source values. */
  id: string
  /**
   * Fetch items for `term` newer than `cursor` (undefined on first poll —
   * fetchers should backfill modestly, not the entire history).
   */
  fetch(term: string, cursor: string | undefined, ctx: CronContext): Promise<FetchResult>
}
