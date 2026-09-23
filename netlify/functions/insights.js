import { checkRateLimit, clientKey } from './_lib/rateLimit.js'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const MAX_TOKENS = 1500
const RATE_LIMIT_PER_MINUTE = 15

const SYSTEM_PROMPT = `You write short, concrete travel context for a single destination.

Respond with ONLY a JSON object. No prose, no explanation, no markdown code fences, no trailing commentary. Do not include internal or system XML tags in your response.

The object has exactly these three fields:
{
  "notability": string,
  "best_season": string,
  "hidden_gem": string
}

What each field holds:
- "notability": 1-2 sentences on why this place is notable to travelers. Lead with what is actually distinctive about it, not a generic opener.
- "best_season": one sentence naming the best time to visit and what makes it good, and the time to avoid if there is an obvious one. Example: "Spring (Mar-May) for cherry blossoms; avoid August humidity".
- "hidden_gem": 1-2 sentences on a lesser-known nearby spot or experience most visitors miss. Name it specifically.

Write for someone deciding whether to go. No hedging, no "this vibrant city" filler. If the place name is ambiguous, use the most travel-relevant interpretation.`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  }
}

// Same degradation contract as extract.js: the caller learns the category,
// never the underlying auth failure.
function unavailable(reason) {
  return json(503, { error: 'Insights temporarily unavailable', reason })
}

function unwrapJson(raw) {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed — use POST' })
  }

  const limit = checkRateLimit('insights', clientKey(event), RATE_LIMIT_PER_MINUTE)
  if (!limit.allowed) {
    return json(
      429,
      { error: 'Too many insight requests — try again in a minute' },
      { 'Retry-After': '60' }
    )
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'Request body must be valid JSON' })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return json(400, { error: 'Provide a non-empty "name" string' })
  }

  // region/country are optional context; the stored shape often folds the
  // country into the name already ("Kyoto, Japan").
  const region = typeof body.region === 'string' ? body.region.trim() : ''
  const country = typeof body.country === 'string' ? body.country.trim() : ''
  const place = [name, region, country].filter(Boolean).join(', ')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[insights] ANTHROPIC_API_KEY is not set')
    return unavailable('auth')
  }

  let payload
  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Thinking is on by default on this model and shares the max_tokens
        // budget; this is a short structured write-up, so spend it all on output.
        thinking: { type: 'disabled' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: place }],
      }),
    })

    if (!response.ok) {
      console.error(`[insights] Anthropic responded ${response.status}`)
      if (response.status === 401) return unavailable('auth')
      if (response.status === 429) return unavailable('rate_limit')
      return unavailable('upstream')
    }

    payload = await response.json()
  } catch (err) {
    console.error('[insights] upstream request failed:', err.message)
    return unavailable('upstream')
  }

  if (payload.stop_reason === 'refusal') {
    console.error('[insights] request was declined by the model')
    return unavailable('upstream')
  }
  if (payload.stop_reason === 'max_tokens') {
    console.error('[insights] response hit max_tokens — JSON is truncated')
    return json(502, { error: 'Could not read the insight result' })
  }

  const raw = (payload.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  let parsed
  try {
    parsed = JSON.parse(unwrapJson(raw))
  } catch {
    console.error('[insights] model did not return parseable JSON')
    return json(502, { error: 'Could not read the insight result' })
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('[insights] model returned JSON but not an object')
    return json(502, { error: 'Could not read the insight result' })
  }

  const insight = {
    notability: typeof parsed.notability === 'string' ? parsed.notability.trim() : '',
    best_season: typeof parsed.best_season === 'string' ? parsed.best_season.trim() : '',
    hidden_gem: typeof parsed.hidden_gem === 'string' ? parsed.hidden_gem.trim() : '',
  }

  // Seen once in testing: valid JSON, end_turn, but a field came back empty.
  // Log which one so it's diagnosable, and treat a missing notability as a
  // failed result rather than rendering an empty panel.
  const missing = Object.keys(insight).filter((key) => !insight[key])
  if (missing.length) {
    console.warn(`[insights] model omitted field(s): ${missing.join(', ')}`)
  }
  if (!insight.notability) {
    return json(502, { error: 'Could not read the insight result' })
  }

  return json(200, insight)
}
