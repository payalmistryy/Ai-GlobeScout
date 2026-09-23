import { useCallback, useEffect, useRef } from 'react'
import { useChromeStorage } from '../sidepanel/useChromeStorage.js'
import GlobeMark from '../sidepanel/GlobeMark.jsx'
import './globe.css'

// The sandbox frames every pin on its first render. A fly-to issued in the
// same tick gets overridden by that framing, so a focus request queued before
// this tab existed waits for the initial framing to settle.
const INITIAL_FRAME_SETTLE_MS = 400

export default function GlobePage() {
  const [locations] = useChromeStorage('locations', [])
  const iframeRef = useRef(null)
  const pendingFocusRef = useRef(null)
  const cesiumReadyRef = useRef(false)

  const sendFlyTo = useCallback((longitude, latitude) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'fly-to', longitude, latitude },
      '*'
    )
  }, [])

  // Send the queued focus request once Cesium is up. Whichever of the two
  // (storage read, cesium-ready) lands second triggers the flight.
  const flushPendingFocus = useCallback(() => {
    const pending = pendingFocusRef.current
    if (!pending || !cesiumReadyRef.current) return
    pendingFocusRef.current = null
    setTimeout(
      () => sendFlyTo(pending.longitude, pending.latitude),
      INITIAL_FRAME_SETTLE_MS
    )
  }, [sendFlyTo])

  // A focus request written by the side panel before this tab existed. Read it
  // once and delete it, so it can't replay the next time the globe is opened.
  useEffect(() => {
    chrome.storage.local.get('focusRequest').then(({ focusRequest }) => {
      if (
        typeof focusRequest?.longitude !== 'number' ||
        typeof focusRequest?.latitude !== 'number'
      ) {
        return
      }
      chrome.storage.local.remove('focusRequest')
      pendingFocusRef.current = focusRequest
      flushPendingFocus()
    })
  }, [flushPendingFocus])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    function sendLocations() {
      iframe.contentWindow?.postMessage(
        { type: 'set-locations', locations },
        '*'
      )
    }

    // Respond when the sandbox tells us it's ready
    function handleMessage(e) {
      if (e.data?.type === 'cesium-ready') {
        cesiumReadyRef.current = true
        sendLocations()
        flushPendingFocus()
      }
    }

    window.addEventListener('message', handleMessage)
    // Send proactively in case the sandbox is already initialized
    sendLocations()

    return () => window.removeEventListener('message', handleMessage)
  }, [locations, flushPendingFocus])

  // Relay "fly to this place" requests from the sidebar into the Cesium iframe.
  // This tab is already framed by now, so these go straight through.
  useEffect(() => {
    function handleStorage(changes, area) {
      if (area === 'local' && changes.focusRequest?.newValue) {
        const { longitude, latitude } = changes.focusRequest.newValue
        sendFlyTo(longitude, latitude)
        // Consume it so reopening the globe later doesn't replay this flight.
        chrome.storage.local.remove('focusRequest')
      }
    }
    chrome.storage.onChanged.addListener(handleStorage)
    return () => chrome.storage.onChanged.removeListener(handleStorage)
  }, [sendFlyTo])

  return (
    <div className="globe-page">
      <div className="globe-page__scrim" aria-hidden="true" />

      <header className="globe-page__header">
        <GlobeMark className="globe-page__logo" size={16} />
        <div>
          <h1 className="globe-page__title">AI GlobeScout</h1>
          <p className="globe-page__tagline">
            {locations.length === 0
              ? 'Add places from the sidebar to see them here'
              : `${locations.length} ${locations.length === 1 ? 'place' : 'places'} ready to explore`}
          </p>
        </div>
      </header>

      <main className="globe-page__main">
        <iframe
          ref={iframeRef}
          src="cesium-sandbox.html"
          className="globe-page__cesium-frame"
          title="AI GlobeScout 3D globe"
        />
      </main>
    </div>
  )
}
