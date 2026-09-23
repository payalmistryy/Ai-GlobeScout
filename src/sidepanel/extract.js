// Mirrors geocode.js: the API key lives behind the Netlify proxy, never in
// the extension bundle.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8888'
const EXTRACT_ENDPOINT = `${API_BASE_URL}/.netlify/functions/extract`
const GEOCODE_ENDPOINT = `${API_BASE_URL}/.netlify/functions/geocode`

const CONTENT_SCRIPT = 'src/content/pageText.js'

// Pages Chrome refuses to let an extension script.
const UNSCRIPTABLE_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'devtools://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
]

const BROWSER_PAGE_ERROR = "Can't scan this page (browser page)"
const NO_CONTENT_ERROR = 'This page has no readable content to scan'
const GENERIC_ERROR = "Couldn't scan this page"

// The proxy degrades every Anthropic-side failure to a 503 carrying a reason;
// the underlying cause is never exposed, so map it to something actionable.
const REASON_MESSAGES = {
  auth: 'AI extraction temporarily unavailable — check back soon',
  rate_limit: 'Too many scans in the last minute, wait a moment',
  upstream: 'AI extraction temporarily unavailable',
}

// Same category, but shown after a Save rather than a Scan — "too many scans"
// would be the wrong noun there.
const SAVE_RATE_LIMIT_ERROR = 'Too many requests in the last minute, wait a moment'

/**
 * One geocoding attempt. Returns coordinates on success, `null` when the
 * geocoder simply didn't know the place (404) so the caller can try a broader
 * query, and throws when something is actually wrong — a 500 must not be
 * mistaken for "not found" and silently fall through to a vaguer query.
 */
async function tryGeocode(query) {
  let response
  try {
    response = await fetch(GEOCODE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: query }),
    })
  } catch {
    throw new Error(REASON_MESSAGES.upstream)
  }

  if (response.status === 404) return null

  let data = null
  try {
    data = await response.json()
  } catch {
    // Fall through to the status handling below.
  }

  if (response.status === 429) throw new Error(SAVE_RATE_LIMIT_ERROR)
  if (response.status === 503) {
    throw new Error(REASON_MESSAGES[data?.reason] || REASON_MESSAGES.upstream)
  }
  if (response.status >= 500) throw new Error(REASON_MESSAGES.upstream)
  if (!response.ok) throw new Error(GENERIC_ERROR)

  if (typeof data?.longitude !== 'number' || typeof data?.latitude !== 'number') {
    return null
  }

  return {
    longitude: data.longitude,
    latitude: data.latitude,
    displayName: data.displayName || query,
  }
}

/**
 * ion sometimes matches the *region* token rather than the place: "Kyoto,
 * Kansai, Japan" comes back as "Kansai International Airport" — 60km from
 * Kyoto. A result that doesn't mention the place we asked for is treated as a
 * miss so the next, broader query gets a turn.
 */
function mentionsPlace(displayName, name) {
  return String(displayName).toLowerCase().includes(name.toLowerCase())
}

/**
 * Resolve a scan result to coordinates, narrowing from most specific query to
 * least: "Arashiyama, Kyoto, Japan" → "Arashiyama, Japan" → "Arashiyama".
 * Only `name` is guaranteed — region and country come from Claude and can be
 * empty, in which case the duplicate queries collapse away.
 *
 * Returns { longitude, latitude, displayName }.
 */
export async function geocodeAndBuildLocation(scanResult) {
  const name = (scanResult?.name || '').trim()
  const region = (scanResult?.region || '').trim()
  const country = (scanResult?.country || '').trim()

  if (!name) {
    throw new Error("Couldn't locate this place on the map")
  }

  const queries = [...new Set([
    [name, region, country].filter(Boolean).join(', '),
    [name, country].filter(Boolean).join(', '),
    name,
  ])]

  for (let i = 0; i < queries.length; i++) {
    const result = await tryGeocode(queries[i])
    if (!result) continue

    // The final attempt is accepted as-is, so alternate spellings still
    // resolve ("Cusco" legitimately comes back as "Cuzco, Peru").
    const isLastAttempt = i === queries.length - 1
    if (isLastAttempt || mentionsPlace(result.displayName, name)) {
      return result
    }
  }

  throw new Error(`Couldn't locate "${name}" on the map`)
}

/**
 * Read the active tab's text and extract travel destinations from it.
 * Returns { locations, url, title }; throws an Error with a message meant for
 * direct display in the side panel.
 */
export async function extractLocationsFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  console.log('AI GlobeScout — tab:', tab?.url, tab?.title, tab?.id, tab?.windowId)
  if (!tab?.id) {
    throw new Error(BROWSER_PAGE_ERROR)
  }
  if (UNSCRIPTABLE_PREFIXES.some((prefix) => (tab.url || '').startsWith(prefix))) {
    throw new Error(BROWSER_PAGE_ERROR)
  }

  // Injection and messaging both fail on restricted pages that slipped past
  // the prefix check (a redirect, a missing host permission).
    try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [CONTENT_SCRIPT],
    })
  } catch (err) {
    console.error('AI GlobeScout — executeScript failed:', err)
    throw new Error(`Can't scan: injection failed — ${err?.message || 'unknown'}`)
  }

  let page
  try {
    page = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page-text' })
  } catch (err) {
    console.error('AI GlobeScout — sendMessage failed:', err)
    throw new Error(`Can't scan: no response from page — ${err?.message || 'unknown'}`)
  }

  if (!page?.ok) {
    throw new Error(NO_CONTENT_ERROR)
  }

  let response
  try {
    response = await fetch(EXTRACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: page.text }),
    })
  } catch {
    throw new Error(REASON_MESSAGES.upstream)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // Fall through to the status handling below.
  }

  if (response.status === 503) {
    throw new Error(REASON_MESSAGES[data?.reason] || REASON_MESSAGES.upstream)
  }
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(GENERIC_ERROR)
  }

  return { locations: data, url: page.url, title: page.title }
}
