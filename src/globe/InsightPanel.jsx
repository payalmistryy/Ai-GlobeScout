import { useEffect, useRef, useState } from 'react'
import { weatherEmojiAndLabel } from './weatherMap.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8888'
const INSIGHTS_ENDPOINT = `${API_BASE_URL}/.netlify/functions/insights`
const LIVE_ENDPOINT = `${API_BASE_URL}/.netlify/functions/live`

// Module-level so it outlives panel re-mounts. Evergreen context doesn't
// change between clicks; live conditions deliberately are never cached.
const evergreenCache = new Map()

const LOADING = 'loading'
const ERROR = 'error'

function Skeleton({ lines = 3 }) {
  return (
    <div className="insight-panel__skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="insight-panel__skeleton-line" />
      ))}
    </div>
  )
}

function localTime(timeZone) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date())
  } catch {
    // An unrecognized IANA zone shouldn't take the whole section down.
    return null
  }
}

export default function InsightPanel({ location, onClose }) {
  // GlobePage keys this component by pin id, so a different pin remounts it and
  // these initializers run fresh. Seeding from the cache here rather than in an
  // effect means a revisited place paints instantly, with no loading flash and
  // no cascading render.
  const [evergreen, setEvergreen] = useState(
    () => (location && evergreenCache.get(location.id)) || LOADING
  )
  const [live, setLive] = useState(LOADING)

  // Clicking the same pin again re-runs the effect without a remount, so a slow
  // earlier response could still overwrite a newer one. Every response checks
  // it is still the latest before committing.
  const requestToken = useRef(0)

  useEffect(() => {
    if (!location) return

    const token = ++requestToken.current
    const isStale = () => requestToken.current !== token

    if (!evergreenCache.has(location.id)) {
      fetch(INSIGHTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: location.name, region: '', country: '' }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
        .then((data) => {
          evergreenCache.set(location.id, data)
          if (!isStale()) setEvergreen(data)
        })
        .catch(() => {
          if (!isStale()) setEvergreen(ERROR)
        })
    }

    // Never cached — the whole point of this section is that it is current.
    fetch(LIVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        longitude: location.longitude,
        latitude: location.latitude,
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
      .then((data) => {
        if (!isStale()) setLive(data)
      })
      .catch(() => {
        if (!isStale()) setLive(ERROR)
      })
  }, [location])

  if (!location) return null

  const time = live && live !== LOADING && live !== ERROR ? localTime(live.timezone) : null
  const weather =
    live && live !== LOADING && live !== ERROR
      ? weatherEmojiAndLabel(live.weather_code, live.wind_speed_kmh)
      : null

  return (
    <aside className="insight-panel" aria-label={`Insights for ${location.name}`}>
      <header className="insight-panel__header">
        <h2 className="insight-panel__title">{location.name}</h2>
        <button
          className="insight-panel__close"
          onClick={onClose}
          aria-label="Close insights"
          title="Close insights"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <section className="insight-panel__section">
        <p className="insight-panel__section-label">Live</p>

        {live === LOADING && <Skeleton lines={2} />}
        {live === ERROR && (
          <p className="insight-panel__unavailable">Live data unavailable</p>
        )}
        {weather && (
          <div className="insight-panel__live">
            {time && <p className="insight-panel__time">{time}</p>}
            <div className="insight-panel__weather">
              <span className="insight-panel__weather-emoji" aria-hidden="true">
                {weather.emoji}
              </span>
              <span className="insight-panel__temp">
                {Math.round(live.temperature_c)}°C
              </span>
            </div>
            <p className="insight-panel__weather-label">{weather.label}</p>
          </div>
        )}
      </section>

      <section className="insight-panel__section">
        <p className="insight-panel__section-label">About</p>

        {evergreen === LOADING && <Skeleton lines={5} />}
        {evergreen === ERROR && (
          <p className="insight-panel__unavailable">Insights unavailable</p>
        )}
        {evergreen && evergreen !== LOADING && evergreen !== ERROR && (
          <>
            {evergreen.notability && (
              <p className="insight-panel__paragraph">{evergreen.notability}</p>
            )}
            {evergreen.best_season && (
              <>
                <p className="insight-panel__field-label">Best season</p>
                <p className="insight-panel__paragraph">{evergreen.best_season}</p>
              </>
            )}
            {evergreen.hidden_gem && (
              <>
                <p className="insight-panel__field-label">Hidden gem</p>
                <p className="insight-panel__paragraph">{evergreen.hidden_gem}</p>
              </>
            )}
          </>
        )}
      </section>
    </aside>
  )
}
