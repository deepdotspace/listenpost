#!/usr/bin/env bash
# Seed demo mentions into a WORKSPACE room via the debug SQL route.
# Usage: scripts/seed-demo.sh <workspaceId> [port]   (port default 5174)
#
# Find a workspaceId: sign in, open the app, then in devtools run
#   localStorage.getItem('listenpost-workspace')
# or query the app room: SELECT _row_id, col_name FROM c_workspaces.
set -euo pipefail
WS="${1:?workspaceId required — see header}"
PORT="${2:-5174}"
URL="http://localhost:${PORT}/api/debug/sql?room=ws:${WS}"

sql() {
  curl -s -X POST "$URL" -H 'Content-Type: application/json' -d "$1" > /dev/null
}

now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# A demo keyword to hang mentions off (id demo-kw-1), inside the workspace room.
sql "{\"sql\":\"INSERT OR IGNORE INTO c_keywords (_row_id,_created_by,_created_at,_updated_at,col_term,col_keyword_type,col_brand_context,col_sources,col_is_active,col_created_by_user) VALUES ('demo-kw-1','seed','$now','$now','listenpost','brand','Listenpost is an AI keyword monitoring tool for devtools teams.','[\"hackernews\",\"reddit\",\"bluesky\"]',1,'seed')\"}"

i=0
seed_mention() { # source|suffix|title|body|author|relevance|score|sentiment|tags|status|engagement|hours|assigned
  IFS='|' read -r src suffix title body author rel score sent tags mstatus engagement hours assigned <<< "$1"
  i=$((i+1))
  local ts
  ts=$(date -u -v-"${hours}"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  sql "{\"sql\":\"INSERT OR REPLACE INTO c_mentions (_row_id,_created_by,_created_at,_updated_at,col_source,col_source_id,col_keyword_id,col_title,col_body,col_url,col_author,col_published_at,col_relevance,col_relevance_score,col_sentiment,col_tags,col_status,col_engagement,col_assigned_to) VALUES ('demo-m-$i','seed','$ts','$ts','$src','demo-$suffix','demo-kw-1','$title','$body','https://example.com/$suffix','$author','$ts','$rel',$score,'$sent','$tags','$mstatus','$engagement',$assigned)\"}"
}

seed_mention 'reddit|r1|Anyone using Listenpost for brand monitoring? Worth the price?|Evaluating a few social listening tools for our devtools startup. Listenpost keeps coming up — how is the relevance filtering in practice?|u/throwaway_dev|high|0.92|neutral|[\"buying_intent\",\"question\"]|new|{\"points\":142,\"comments\":38}|2|NULL'
seed_mention 'bluesky|b1|just switched from Mention to Listenpost|half the mentions I used to triage manually never even reach me now. relevance scoring is doing its job.|@maria.bsky|high|0.89|positive|[\"praise\",\"comparison\"]|new|{\"likes\":56}|3|NULL'
seed_mention 'hackernews|h1|Show HN: I built a social listening tool with AI relevance scoring|It watches Reddit, HN, Bluesky and GitHub for keywords and scores each hit against your brand context before it ever pings you.|pg_fan|high|0.87|positive|[\"competitor_mention\"]|assigned|{\"points\":89,\"comments\":41}|5|'"'"'seed'"'"''
seed_mention 'hackernews|h2|Ask HN: social listening tools that do not suck?|Looking for something that catches HN and Reddit mentions with decent relevance filtering. Everything I tried floods me with noise.|tomvv|high|0.91|neutral|[\"buying_intent\",\"question\"]|new|{\"points\":64,\"comments\":29}|6|NULL'
seed_mention 'github|g1|Feature request: scheduled Slack digest for daily mentions|Would love a daily Slack digest instead of per-mention alerts. Our channel gets noisy during launch weeks.|octocat|medium|0.58|neutral|[\"feature_request\"]|assigned|{\"replies\":12}|26|'"'"'seed'"'"''
seed_mention 'reddit|r2|Is Listenpost overkill for a solo founder?|I only track one brand term. Wondering if the free tier covers enough or if I should just use Google Alerts.|u/indie_maker|medium|0.55|neutral|[\"question\"]|new|{\"points\":34,\"comments\":11}|28|NULL'
seed_mention 'youtube|y1|Top 5 Social Listening Tools in 2026 (ranked and compared)|A full walkthrough comparing pricing, sources, and AI scoring across the leading brand-monitoring tools.|TechReviewsDaily|medium|0.52|positive|[\"comparison\"]|resolved|{\"views\":4200}|50|NULL'
seed_mention 'news|n1|Social listening startups see renewed VC interest in 2026|Investors circle back to brand-monitoring SaaS as AI scoring makes the category sticky again.|TechCrunch|low|0.31|neutral|[]|resolved|{}|74|NULL'
seed_mention 'reddit|r3|listenpost vs brand24 — which has better reddit coverage?|Specifically care about niche subreddits. Anyone compared them head to head?|u/saas_scout|low|0.28|neutral|[\"comparison\",\"question\"]|ignored|{\"points\":18,\"comments\":7}|98|NULL'
seed_mention 'reddit|r4|Their webhook alerts have been flaky for weeks|Actively looking at alternatives. Support has been slow to respond, open to suggestions.|r/devtools|high|0.88|negative|[\"churn_risk\",\"complaint\"]|new|{\"points\":56,\"comments\":34}|1|NULL'

echo "Seeded $i mentions + demo keyword into ws:${WS}."
