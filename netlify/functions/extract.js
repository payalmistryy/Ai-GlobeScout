import { checkRateLimit, clientKey } from './_lib/rateLimit.js'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const MAX_TOKENS = 2000
const MAX_INPUT_CHARS = 8000
const RATE_LIMIT_PER_MINUTE = 10

const DESTINATION_TYPES = [
  'city',
  'landmark',
  'beach',
  'mountain',
  'island',
  'natural_feature',
  'region',
  'country',
]

const SYSTEM_PROMPT = `You extract travel destinations from the text of a webpage.

Respond with ONLY a JSON array. No prose, no explanation, no markdown code fences, no trailing commentary. Do not include internal or system XML tags in your response.

Every element of the array has exactly these fields:
{
  "name": string,
  "type": ${DESTINATION_TYPES.map((t) => `"${t}"`).join(' | ')},
  "country": string,
  "region": string,
  "notability": string
}

How to decide what counts:
- Disambiguate from context. "Washington" can be the city, the state, or a person; read the surrounding text to tell which, and skip it entirely when it refers to a person.
- Skip mentions that are not travel destinations: people, companies, and businesses with no geographic significance of their own.
- "notability" is one short sentence on why a traveller would go there.
- "region" is the state, province, or area within the country. Use an empty string for "country" or "region" when the text does not support a value — never guess.
- If the text contains no travel destinations, return exactly [].`

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

// Every Anthropic-side failure degrades to the same user-visible message; the
// reason is for our own telemetry, never an explanation of the auth failure.
function unavailable(reason) {
  return json(503, { error: 'AI extraction temporarily unavailable', reason })
}

// The prompt forbids code fences, but strip them defensively rather than
// 502-ing on an otherwise perfectly good array.
function unwrapJson(raw) {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function normalize(entry) {
  if (!entry || typeof entry !== 'object') return null
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (!name) return null
  return {
    name,
    type: DESTINATION_TYPES.includes(entry.type) ? entry.type : 'region',
    country: typeof entry.country === 'string' ? entry.country : '',
    region: typeof entry.region === 'string' ? entry.region : '',
    notability: typeof entry.notability === 'string' ? entry.notability : '',
  }
}

/**
 * Extracts travel destinations from page text via the Claude Messages API,
 * keeping ANTHROPIC_API_KEY server-side.
 */
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed — use POST' })
  }

  const limit = checkRateLimit('extract', clientKey(event), RATE_LIMIT_PER_MINUTE)
  if (!limit.allowed) {
    return json(
      429,
      { error: 'Too many extraction requests — try again in a minute' },
      { 'Retry-After': '60' }
    )
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'Request body must be valid JSON' })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return json(400, { error: 'Provide a non-empty "text" string to scan' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[extract] ANTHROPIC_API_KEY is not set')
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
        // budget with the answer. Extraction doesn't need it, and disabling it
        // keeps all 2000 tokens available for the JSON array.
        thinking: { type: 'disabled' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text.slice(0, MAX_INPUT_CHARS) }],
      }),
    })

    if (!response.ok) {
      // Status only — never the response body, and never the key.
      console.error(`[extract] Anthropic responded ${response.status}`)
      if (response.status === 401) return unavailable('auth')
      if (response.status === 429) return unavailable('rate_limit')
      return unavailable('upstream')
    }

    payload = await response.json()
  } catch (err) {
    console.error('[extract] upstream request failed:', err.message)
    return unavailable('upstream')
  }

  // Safety classifiers can decline a request with a 200 and empty content.
  if (payload.stop_reason === 'refusal') {
    console.error('[extract] request was declined by the model')
    return unavailable('upstream')
  }
  if (payload.stop_reason === 'max_tokens') {
    console.error('[extract] response hit max_tokens — JSON is truncated')
    return json(502, { error: 'Could not read the extraction result' })
  }

  const raw = (payload.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  let parsed
  try {
    parsed = JSON.parse(unwrapJson(raw))
  } catch {
    console.error('[extract] model did not return parseable JSON')
    return json(502, { error: 'Could not read the extraction result' })
  }

  if (!Array.isArray(parsed)) {
    console.error('[extract] model returned JSON but not an array')
    return json(502, { error: 'Could not read the extraction result' })
  }

  return json(200, parsed.map(normalize).filter(Boolean))
}
