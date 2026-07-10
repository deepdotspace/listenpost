/**
 * AI mention scoring — prompt construction and response parsing for the
 * score-mention job. Kept separate from jobs.ts so the prompt contract
 * is easy to evolve and test.
 */

import type { Mention, Keyword, Relevance, Sentiment } from './types'

export interface MentionScore {
  relevance: Exclude<Relevance, 'pending'>
  relevance_score: number
  sentiment: Exclude<Sentiment, 'pending'>
  tags: string[]
}

/** Tags the model may assign. Mirrors Listenpost's auto-tag vocabulary. */
export const TAG_VOCABULARY = [
  'feature_request',
  'bug_report',
  'competitor_mention',
  'buying_intent',
  'question',
  'praise',
  'complaint',
  'comparison',
  'churn_risk',
] as const

const MAX_BODY_CHARS = 2000

export const SCORING_SYSTEM_PROMPT = `You are a social-listening analyst. You judge whether a web mention matters to a specific brand, and how.

Respond with ONLY a JSON object, no prose, matching:
{
  "relevance": "high" | "medium" | "low",
  "relevance_score": <number 0..1>,
  "sentiment": "positive" | "negative" | "neutral",
  "tags": [<zero or more of: ${TAG_VOCABULARY.map((t) => `"${t}"`).join(', ')}>]
}

Guidance:
- "relevance" is about the BRAND CONTEXT provided, not general interest.
  high = directly about the monitored subject or a clear buying/usage signal;
  medium = related discussion the team would want to skim;
  low = coincidental keyword match or off-topic.
- "sentiment" is the author's attitude toward the monitored subject, not the
  general mood of the text. Use "neutral" when it's informational.
- Add "buying_intent" whenever the author is choosing, evaluating, or asking
  for recommendations in the product's space.`

export function buildScoringPrompt(mention: Mention, keyword: Keyword): string {
  const body = (mention.body ?? '').slice(0, MAX_BODY_CHARS)
  return [
    `Monitored keyword: "${keyword.term}" (type: ${keyword.keyword_type ?? 'brand'})`,
    `Brand context: ${keyword.brand_context?.trim() || '(none provided — judge by the keyword alone)'}`,
    '',
    `Mention (from ${mention.source}):`,
    mention.title ? `Title: ${mention.title}` : null,
    mention.author ? `Author: ${mention.author}` : null,
    `Text: ${body || '(no text)'}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

const RELEVANCES = ['high', 'medium', 'low'] as const
const SENTIMENTS = ['positive', 'negative', 'neutral'] as const

/** Parse the model's reply into a MentionScore. Throws on garbage. */
export function parseScore(text: string): MentionScore {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON object in model reply: ${text.slice(0, 200)}`)
  const raw = JSON.parse(match[0]) as Record<string, unknown>

  const relevance = RELEVANCES.includes(raw.relevance as never)
    ? (raw.relevance as MentionScore['relevance'])
    : 'low'
  const sentiment = SENTIMENTS.includes(raw.sentiment as never)
    ? (raw.sentiment as MentionScore['sentiment'])
    : 'neutral'
  const score = typeof raw.relevance_score === 'number' ? raw.relevance_score : 0
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string' && TAG_VOCABULARY.includes(t as never))
    : []

  return {
    relevance,
    relevance_score: Math.max(0, Math.min(1, score)),
    sentiment,
    tags,
  }
}
