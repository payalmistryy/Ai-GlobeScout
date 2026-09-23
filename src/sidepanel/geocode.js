// The Cesium ion token no longer ships in the bundle — the Netlify function at
// /.netlify/functions/geocode holds it and proxies the lookup. The base URL is
// inlined at build time, so this works from the side panel and from the
// service worker (background.js) alike.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8888'
const GEOCODE_ENDPOINT = `${API_BASE_URL}/.netlify/functions/geocode`

/**
 * Resolve a place name to coordinates via the GlobeScout proxy.
 * Returns { longitude, latitude, displayName } or throws an Error.
 */
export async function geocode(name) {
  let response
  try {
    response = await fetch(GEOCODE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  } catch {
    throw new Error("Couldn't reach the lookup service")
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // Fall through to the status-based message below.
  }

  if (!response.ok) {
    throw new Error(data?.error || `Geocoding failed (${response.status})`)
  }

  if (
    typeof data?.longitude !== 'number' ||
    typeof data?.latitude !== 'number'
  ) {
    throw new Error(`Couldn't locate "${name}"`)
  }

  return {
    longitude: data.longitude,
    latitude: data.latitude,
    displayName: data.displayName || name,
  }
}
