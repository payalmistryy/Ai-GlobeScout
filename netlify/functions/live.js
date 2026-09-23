import { checkRateLimit, clientKey } from './_lib/rateLimit.js'

// Open-Meteo needs no key and serves weather + timezone in one request.
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const RATE_LIMIT_PER_MINUTE = 60

const UNAVAILABLE = { error: 'Live data temporarily unavailable' }

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

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Pure proxy for current conditions. No LLM, no key, no caching — weather is
 * the one thing here that has to be fresh. Weather codes are passed through
 * untranslated; the frontend owns the emoji mapping.
 */
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed — use POST' })
  }

  const limit = checkRateLimit('live', clientKey(event), RATE_LIMIT_PER_MINUTE)
  if (!limit.allowed) {
    return json(
      429,
      { error: 'Too many live data requests — try again in a minute' },
      { 'Retry-After': '60' }
    )
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'Request body must be valid JSON' })
  }

  const { longitude, latitude } = body
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    return json(400, { error: '"longitude" must be a number between -180 and 180' })
  }
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    return json(400, { error: '"latitude" must be a number between -90 and 90' })
  }

  let data
  try {
    const url = new URL(FORECAST_ENDPOINT)
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m')
    url.searchParams.set('timezone', 'auto')

    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[live] Open-Meteo responded ${response.status}`)
      return json(503, UNAVAILABLE)
    }
    data = await response.json()
  } catch (err) {
    console.error('[live] upstream request failed:', err.message)
    return json(503, UNAVAILABLE)
  }

  const current = data?.current
  if (!current || !isFiniteNumber(current.temperature_2m)) {
    console.error('[live] Open-Meteo returned no current conditions')
    return json(503, UNAVAILABLE)
  }

  return json(200, {
    temperature_c: current.temperature_2m,
    weather_code: current.weather_code,
    wind_speed_kmh: current.wind_speed_10m,
    timezone: data.timezone,
    utc_offset_seconds: data.utc_offset_seconds,
  })
}
