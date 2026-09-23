import { geocode } from './sidepanel/geocode.js'

// Two guards keep the back-fill from looping, since a pass writes to the very
// key it also listens on:
//   `healing`      — no overlapping passes
//   `unresolvable` — a place the geocoder can't resolve isn't retried on
//                    every subsequent write (reset when the worker restarts)
let healing = false
const unresolvable = new Set()

// Back-fill coordinates for any saved place that lacks them (e.g. places added
// before geocoding existed). This is the only writer of `locations` outside the
// side panel's own add/delete, so there's nothing to race with.
async function healLocations() {
  if (healing) return
  healing = true

  try {
    const { locations = [] } = await chrome.storage.sync.get('locations')

    let changed = false
    const healed = await Promise.all(
      locations.map(async (loc) => {
        const hasCoords =
          typeof loc.longitude === 'number' && typeof loc.latitude === 'number'
        if (hasCoords || unresolvable.has(loc.id)) {
          return loc
        }
        try {
          const { longitude, latitude, displayName } = await geocode(loc.name)
          changed = true
          return { ...loc, longitude, latitude, name: displayName }
        } catch {
          unresolvable.add(loc.id)
          return loc
        }
      })
    )

    if (changed) {
      await chrome.storage.sync.set({ locations: healed })
    }
  } finally {
    healing = false
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  healLocations()
})

chrome.runtime.onStartup.addListener(healLocations)

// Catch places that arrive without coordinates by any path — today the side
// panel geocodes before saving, but a future importer or sync from another
// device might not.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.locations) return

  const needsCoords = (changes.locations.newValue || []).some(
    (loc) =>
      (typeof loc.longitude !== 'number' || typeof loc.latitude !== 'number') &&
      !unresolvable.has(loc.id)
  )
  if (needsCoords) healLocations()
})
