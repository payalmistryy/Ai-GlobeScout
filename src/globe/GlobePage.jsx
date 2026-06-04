import { useChromeStorage } from '../sidepanel/useChromeStorage.js'
import './globe.css'

export default function GlobePage() {
  const [locations] = useChromeStorage('locations', [])

  return (
    <div className="globe-page">
      <header className="globe-page__header">
        <img
          src="/icons/icon48.png"
          alt="AI GlobeScout"
          className="globe-page__logo"
        />
        <div>
          <h1 className="globe-page__title">AI GlobeScout</h1>
          <p className="globe-page__tagline">
            {locations.length === 0
              ? 'Add places from the sidebar to populate the globe'
              : `${locations.length} ${locations.length === 1 ? 'place' : 'places'} ready to explore`}
          </p>
        </div>
      </header>

      <main className="globe-page__main">
        <div className="globe-page__placeholder">
          <div className="globe-page__placeholder-orb" aria-hidden="true">
            <svg viewBox="0 0 200 200" width="120" height="120" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="100" cy="100" r="90" />
              <ellipse cx="100" cy="100" rx="90" ry="40" />
              <ellipse cx="100" cy="100" rx="40" ry="90" />
              <path d="M10 100 Q 100 60 190 100" />
              <path d="M10 100 Q 100 140 190 100" />
            </svg>
          </div>
          <h2 className="globe-page__placeholder-title">Globe loads here</h2>
          <p className="globe-page__placeholder-text">
            Cesium World Terrain will render in this view in Phase 2B
          </p>
        </div>
      </main>
    </div>
  )
}