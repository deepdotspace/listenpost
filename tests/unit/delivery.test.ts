import { describe, it, expect } from 'vitest'
import { matchesRule, signPayload, digestIsDue, formatMentionText } from '../../src/delivery'
import type { Mention } from '../../src/types'

const mention: Mention = {
  source: 'hackernews',
  source_id: '123',
  title: 'Our product broke',
  body: 'Long text',
  url: 'https://news.ycombinator.com/item?id=123',
  relevance: 'high',
  relevance_score: 0.9,
  sentiment: 'negative',
  tags: ['bug_report'],
  keyword_id: 'kw1',
  keyword_ids: ['kw1'],
}

describe('matchesRule', () => {
  it('matches everything when match is empty/undefined', () => {
    expect(matchesRule(mention, undefined)).toBe(true)
    expect(matchesRule(mention, {})).toBe(true)
  })

  it('filters by source', () => {
    expect(matchesRule(mention, { sources: ['hackernews'] })).toBe(true)
    expect(matchesRule(mention, { sources: ['reddit'] })).toBe(false)
  })

  it('filters by sentiment', () => {
    expect(matchesRule(mention, { sentiment: ['negative'] })).toBe(true)
    expect(matchesRule(mention, { sentiment: ['positive', 'neutral'] })).toBe(false)
  })

  it('applies relevance_min as a floor', () => {
    expect(matchesRule(mention, { relevance_min: 'medium' })).toBe(true)
    expect(matchesRule({ ...mention, relevance: 'low' }, { relevance_min: 'medium' })).toBe(false)
    expect(matchesRule({ ...mention, relevance: 'pending' }, { relevance_min: 'low' })).toBe(false)
  })

  it('filters by keyword ids (any overlap)', () => {
    expect(matchesRule(mention, { keyword_ids: ['kw1', 'kw9'] })).toBe(true)
    expect(matchesRule(mention, { keyword_ids: ['kw9'] })).toBe(false)
  })

  it('filters by tags (any overlap)', () => {
    expect(matchesRule(mention, { tags: ['bug_report'] })).toBe(true)
    expect(matchesRule(mention, { tags: ['praise'] })).toBe(false)
  })

  it('requires ALL groups to pass', () => {
    expect(matchesRule(mention, { sources: ['hackernews'], sentiment: ['positive'] })).toBe(false)
  })
})

describe('signPayload', () => {
  it('produces a stable HMAC-SHA256 hex signature', async () => {
    const sig = await signPayload('secret', 'body')
    // Independently computed: printf '%s' body | openssl dgst -sha256 -hmac secret
    expect(sig).toBe('dc46983557fea127b43af721467eb9b3fde2338fe3e14f51952aa8478c13d355')
    expect(await signPayload('other', 'body')).not.toBe(sig)
  })
})

describe('digestIsDue', () => {
  // 2026-07-08 is a Wednesday. 15:00 UTC.
  const nowMs = Date.parse('2026-07-08T15:00:00Z')

  it('daily digest is due after its local send time when never sent', () => {
    expect(digestIsDue({ schedule: 'daily', time: '09:00', timezone: 'UTC', is_active: 1 }, nowMs)).toBe(true)
    expect(digestIsDue({ schedule: 'daily', time: '16:00', timezone: 'UTC', is_active: 1 }, nowMs)).toBe(false)
  })

  it('respects timezone wall clock', () => {
    // 15:00 UTC = 08:00 in Los Angeles (PDT, UTC-7) — 09:00 digest not due yet.
    expect(
      digestIsDue({ schedule: 'daily', time: '09:00', timezone: 'America/Los_Angeles', is_active: 1 }, nowMs),
    ).toBe(false)
    // …but a 07:00 digest is.
    expect(
      digestIsDue({ schedule: 'daily', time: '07:00', timezone: 'America/Los_Angeles', is_active: 1 }, nowMs),
    ).toBe(true)
  })

  it('does not double-send within the same day', () => {
    expect(
      digestIsDue(
        {
          schedule: 'daily',
          time: '09:00',
          timezone: 'UTC',
          is_active: 1,
          last_sent_at: '2026-07-08T09:01:00Z',
        },
        nowMs,
      ),
    ).toBe(false)
    expect(
      digestIsDue(
        {
          schedule: 'daily',
          time: '09:00',
          timezone: 'UTC',
          is_active: 1,
          last_sent_at: '2026-07-07T09:01:00Z',
        },
        nowMs,
      ),
    ).toBe(true)
  })

  it('weekly digests only fire on Mondays', () => {
    expect(digestIsDue({ schedule: 'weekly', time: '09:00', timezone: 'UTC', is_active: 1 }, nowMs)).toBe(false)
    const monday = Date.parse('2026-07-06T15:00:00Z')
    expect(digestIsDue({ schedule: 'weekly', time: '09:00', timezone: 'UTC', is_active: 1 }, monday)).toBe(true)
  })

  it('inactive digests are never due', () => {
    expect(digestIsDue({ schedule: 'daily', time: '09:00', timezone: 'UTC', is_active: 0 }, nowMs)).toBe(false)
  })

  it('bad timezone strings never fire', () => {
    expect(digestIsDue({ schedule: 'daily', time: '09:00', timezone: 'Not/AZone', is_active: 1 }, nowMs)).toBe(false)
  })
})

describe('formatMentionText', () => {
  it('includes rule name, title, meta, and url', () => {
    const text = formatMentionText(mention, 'Bug alerts')
    expect(text).toContain('Bug alerts')
    expect(text).toContain('Our product broke')
    expect(text).toContain('relevance: high')
    expect(text).toContain('bug_report')
    expect(text).toContain(mention.url)
  })
})
