import { checkRateLimit, clientKey } from './_lib/rateLimit.js'

const ION_TOKEN = process.env.CESIUM_ION_TOKEN
const GEOCODE_ENDPOINT = 'https://api.cesium.com/v1/geocode/search'
const RATE_LIMIT_PER_MINUTE = 20

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

/**
 * Proxies Cesium ion's geocoder so the ion token stays server-side.
 * Returns the same { longitude, latitude, displayName } shape the extension
 * already expects.
 */
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed — use POST' })
  }

  const limit = checkRateLimit('geocode', clientKey(event), RATE_LIMIT_PER_MINUTE)
  if (!limit.allowed) {
    return json(
      429,
      { error: 'Too many geocoding requests — try again in a minute' },
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
    return json(400, { error: 'Provide a non-empty "name" string to look up' })
  }

  if (!ION_TOKEN) {
    console.error('[geocode] CESIUM_ION_TOKEN is not set')
    return json(500, { error: 'Geocoding is temporarily unavailable' })
  }

  let data
  try {
    const url = new URL(GEOCODE_ENDPOINT)
    url.searchParams.set('text', name)
    url.searchParams.set('access_token', ION_TOKEN)

    const response = await fetch(url)
    if (!response.ok) {
      // Log the status only — the upstream body is never surfaced to callers.
      console.error(`[geocode] Cesium ion responded ${response.status}`)
      return json(500, { error: 'Geocoding is temporarily unavailable' })
    }
    data = await response.json()
  } catch (err) {
    console.error('[geocode] upstream request failed:', err.message)
    return json(500, { error: 'Geocoding is temporarily unavailable' })
  }

  const features = data.features || []
  if (features.length === 0) {
    return json(404, { error: `Couldn't find "${name}"` })
  }

  // ion returns a bounding box ([west, south, east, north]) rather than point
  // geometry, so use the center of the box.
  const best = features[0]
  if (!Array.isArray(best.bbox) || best.bbox.length < 4) {
    return json(404, { error: `Couldn't locate "${name}"` })
  }
  const [west, south, east, north] = best.bbox

  return json(200, {
    longitude: (west + east) / 2,
    latitude: (south + north) / 2,
    displayName: best.properties?.label || name,
  })
}
