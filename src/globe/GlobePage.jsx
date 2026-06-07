import { useEffect, useRef } from 'react'
import { useChromeStorage } from '../sidepanel/useChromeStorage.js'
import './globe.css'

export default function GlobePage() {
  const [locations] = useChromeStorage('locations', [])
  const iframeRef = useRef(null)

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
        sendLocations()
      }
    }

    window.addEventListener('message', handleMessage)
    // Also send proactively in case the sandbox is already initialized
    sendLocations()

    return () => window.removeEventListener('message', handleMessage)
  }, [locations])

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