/**
 * Record data shapes (the `data` field inside record envelopes).
 * Kept in sync with the schemas in src/schemas/.
 */

import type { MentionSource } from './schemas/mentions-schema'

export type KeywordType = 'brand' | 'feature' | 'competitor' | 'pain_point'

export interface Keyword {
  term: string
  keyword_type: KeywordType
  brand_context?: string
  sources?: string[]
  is_active?: number
  created_by_user?: string
}

export type Relevance = 'pending' | 'low' | 'medium' | 'high'
export type Sentiment = 'pending' | 'positive' | 'negative' | 'neutral'
export type MentionStatus = 'new' | 'assigned' | 'resolved' | 'ignored'

export interface Mention {
  source: MentionSource
  source_id: string
  keyword_id?: string
  keyword_ids?: string[]
  author?: string
  author_url?: string
  url?: string
  title?: string
  body?: string
  published_at?: string
  fetched_at?: string
  relevance?: Relevance
  relevance_score?: number
  sentiment?: Sentiment
  tags?: string[]
  engagement?: Record<string, number>
  status?: MentionStatus
  assigned_to?: string
  notes?: string
}

export interface AlertRuleMatch {
  sources?: string[]
  sentiment?: Sentiment[]
  relevance_min?: 'low' | 'medium' | 'high'
  keyword_ids?: string[]
  tags?: string[]
}

export interface AlertRule {
  name: string
  match?: AlertRuleMatch
  channel: 'slack' | 'email' | 'webhook'
  target?: { channelId?: string; channelName?: string; email?: string; endpointId?: string }
  is_active?: number
  created_by_user?: string
}

export interface WebhookEndpoint {
  label?: string
  url: string
  secret?: string
  filters?: AlertRuleMatch
  last_delivery_at?: string
  failure_count?: number
  is_active?: number
}

export interface ApiKey {
  label: string
  key_hash: string
  prefix?: string
  scopes?: string[]
  last_used_at?: string
  is_active?: number
  created_by_user?: string
}

export interface NotificationTarget {
  type: 'slack_channel' | 'email'
  label: string
  config?: { channelId?: string; channelName?: string; email?: string }
  is_active?: number
}

export interface Digest {
  schedule: 'daily' | 'weekly'
  time?: string
  timezone?: string
  filters?: AlertRuleMatch
  target?: { email?: string; channelId?: string }
  last_sent_at?: string
  is_active?: number
  created_by_user?: string
}

export interface SourceState {
  source: string
  keyword_id: string
  last_seen_id?: string
  last_polled_at?: string
}

export type { MentionSource }
