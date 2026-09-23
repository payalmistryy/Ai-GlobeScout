import { useState, useRef } from 'react'
import LocationInput from './LocationInput.jsx'
import LocationCard from './LocationCard.jsx'
import ScanResultCard from './ScanResultCard.jsx'
import TabBar from './TabBar.jsx'
import GlobeMark from './GlobeMark.jsx'
import { useChromeStorage } from './useChromeStorage.js'
import { geocode } from './geocode.js'
import { extractLocationsFromActiveTab } from './extract.js'
import './styles.css'

export default function App() {
  const [locations, setLocations] = useChromeStorage('locations', [])
  const [activeTab, setActiveTab] = useState('saved')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState(null)

  // Quick Scan is per-page and ephemeral by design — deliberately local state,
  // never written to chrome.storage.
  const [scanResults, setScanResults] = useState(null)
  const [scanSource, setScanSource] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  const [scanError, setScanError] = useState(null)
  const statusTimer = useRef(null)

  // Back-filling coordinates for places saved without them lives in the
  // service worker (background.js) — one writer for `locations` avoids races.

  async function handleAdd(name) {
    setError(null)
    setIsAdding(true)
    try {
      const { longitude, latitude, displayName } = await geocode(name)
      const newLocation = {
        id: crypto.randomUUID(),
        name: displayName,
        longitude,
        latitude,
        addedAt: Date.now(),
      }
      setLocations((prev) => [newLocation, ...prev])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsAdding(false)
    }
  }

  function handleDelete(id) {
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
  }

  // Clicking a saved place flies the globe to it. The request goes to
  // storage.local first so a globe tab we're about to open can pick it up on
  // mount; an already-open one gets it live via storage.onChanged.
  async function handleFocus(loc) {
    if (typeof loc.longitude !== 'number' || typeof loc.latitude !== 'number') {
      return
    }
    await chrome.storage.local.set({
      focusRequest: {
        id: loc.id,
        longitude: loc.longitude,
        latitude: loc.latitude,
        ts: Date.now(),
      },
    })
    openGlobe()
  }

  async function handleScan() {
    setScanError(null)
    setScanResults(null)
    setScanSource(null)
    setIsScanning(true)

    // Two-step status: reading the page is near-instant, the model call isn't.
    setScanStatus('Reading page…')
    statusTimer.current = setTimeout(
      () => setScanStatus('Analyzing with Claude…'),
      500
    )

    try {
      const { locations: found, url, title } = await extractLocationsFromActiveTab()
      setScanResults(found)
      setScanSource({ url, title })
    } catch (err) {
      setScanError(err.message)
    } finally {
      clearTimeout(statusTimer.current)
      setIsScanning(false)
      setScanStatus(null)
    }
  }

  function clearScan() {
    setScanResults(null)
    setScanSource(null)
    setScanError(null)
  }

  // Saving a scan result to the bucket list lands in the next phase — it needs
  // geocoding to fill in the coordinates the stored shape requires.
  function handleSaveScanResult(location) {
    console.log('[GlobeScout] Save from Quick Scan (not yet implemented):', location)
  }

  // Focus the globe tab if one is already open, rather than stacking up a new
  // tab on every click.
  async function openGlobe() {
    const url = chrome.runtime.getURL('src/globe/index.html')
    const [existing] = await chrome.tabs.query({ url })

    if (existing) {
      await chrome.tabs.update(existing.id, { active: true })
      await chrome.windows.update(existing.windowId, { focused: true })
      return
    }

    await chrome.tabs.create({ url })
  }

  return (
    <div className="app">
      <header className="app__header">
        <GlobeMark className="app__logo-mark" />
        <div className="app__header-text">
          <h1 className="app__title">AI GlobeScout</h1>
          <p className="app__tagline">Discover new places every day</p>
        </div>
        {locations.length > 0 && (
          <div className="app__counter" aria-label={`${locations.length} saved places`}>
            <span className="app__counter-number">{locations.length}</span>
            <span className="app__counter-label">
              {locations.length === 1 ? 'place' : 'places'}
            </span>
          </div>
        )}
      </header>

      <main className="app__main">
        <TabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === 'saved' ? (
          <>
            <LocationInput onAdd={handleAdd} isLoading={isAdding} />
            {error && (
              <div className="app__error" role="alert">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            {locations.length === 0 ? (
              <div className="app__empty">
                <div className="app__empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <ellipse cx="12" cy="12" rx="4" ry="9" />
                    <path d="M3.4 9h17.2M3.4 15h17.2" />
                  </svg>
                </div>
                <p className="app__empty-text">Your bucket list starts here</p>
                <p className="app__empty-hint">
                  Try adding <span className="app__empty-example">Mount Hood</span> or <span className="app__empty-example">Kyoto</span>
                </p>
              </div>
            ) : (
              <>
                <div className="app__section-label">
                  <span>Saved</span>
                  <span>{locations.length}</span>
                </div>
                <ul className="location-list">
                  {locations.map((loc) => (
                    <li key={loc.id}>
                      <LocationCard location={loc} onDelete={handleDelete} onFocus={handleFocus} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <>
            <button
              className="scan-button"
              onClick={handleScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="location-input__spinner">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              )}
              {isScanning ? 'Scanning…' : 'Scan this page'}
            </button>

            {scanError && (
              <div className="app__error" role="alert">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span>{scanError}</span>
              </div>
            )}

            {isScanning && (
              <p className="scan-status" role="status">
                {scanStatus}
              </p>
            )}

            {!isScanning && scanResults === null && !scanError && (
              <div className="app__empty">
                <div className="app__empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <p className="app__empty-text">
                  Click to find travel destinations on this page
                </p>
              </div>
            )}

            {!isScanning && scanResults?.length === 0 && (
              <div className="app__empty">
                <div className="app__empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <p className="app__empty-text">
                  No travel destinations found on this page
                </p>
                {scanSource?.title && (
                  <p className="app__empty-hint">{scanSource.title}</p>
                )}
              </div>
            )}

            {!isScanning && scanResults?.length > 0 && (
              <>
                <div className="scan-results-header">
                  <span>
                    {scanResults.length}{' '}
                    {scanResults.length === 1 ? 'place' : 'places'} found
                  </span>
                  <button className="scan-clear" onClick={clearScan}>
                    Clear results
                  </button>
                </div>
                <ul className="location-list">
                  {scanResults.map((loc, i) => (
                    <li key={`${loc.name}-${i}`}>
                      <ScanResultCard
                        location={loc}
                        onSave={handleSaveScanResult}
                      />
                    </li>
                  ))}
                </ul>
                <p className="scan-caption">
                  Cleared automatically when you scan another page
                </p>
              </>
            )}
          </>
        )}
      </main>

      <button className="app__globe-button" onClick={openGlobe}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3.4 9h17.2M3.4 15h17.2" />
        </svg>
        Open Globe
      </button>
    </div>
  )
}