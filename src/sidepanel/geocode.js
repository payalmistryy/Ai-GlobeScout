const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN
const GEOCODE_ENDPOINT = 'https://api.cesium.com/v1/geocode/search'

/**
 * Resolve a place name to coordinates using Cesium ion's geocoding service.
 * Returns { longitude, latitude, displayName } or throws an Error.
 */
export async function geocode(name) {
  if (!ION_TOKEN) {
    throw new Error('Missing Cesium ion token')
  }

  const url = new URL(GEOCODE_ENDPOINT)
  url.searchParams.set('text', name)
  url.searchParams.set('access_token', ION_TOKEN)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status})`)
  }

  const data = await response.json()
  const features = data.features || []

  if (features.length === 0) {
    throw new Error(`Couldn't find "${name}"`)
  }

  // The first feature is the best match. Cesium ion's geocoder returns a
  // bounding box ([west, south, east, north]) rather than point geometry,
  // so use the center of the box as the location's coordinates.
  const best = features[0]
  if (!Array.isArray(best.bbox) || best.bbox.length < 4) {
    throw new Error(`Couldn't locate "${name}"`)
  }
  const [west, south, east, north] = best.bbox

  return {
    longitude: (west + east) / 2,
    latitude: (south + north) / 2,
    displayName: best.properties?.label || name,
  }
}