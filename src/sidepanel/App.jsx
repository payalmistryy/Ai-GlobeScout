import { useState } from 'react'
import LocationInput from './LocationInput.jsx'
import LocationCard from './LocationCard.jsx'
import TabBar from './TabBar.jsx'
import { useChromeStorage } from './useChromeStorage.js'
import './styles.css'

export default function App() {
  const [locations, setLocations] = useChromeStorage('locations', [])
  const [activeTab, setActiveTab] = useState('saved')

  function handleAdd(name) {
    const newLocation = {
      id: crypto.randomUUID(),
      name,
    }
    setLocations((prev) => [newLocation, ...prev])
  }

  function handleDelete(id) {
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
  }

  function openGlobe() {
    const url = chrome.runtime.getURL('src/globe/index.html')
    chrome.tabs.create({ url })
  }

  return (
    <div className="app">
      <header className="app__header">
        <img
          src="/icons/icon48.png"
          alt="AI GlobeScout"
          className="app__logo-mark"
        />
        <div>
          <h1 className="app__title">AI GlobeScout</h1>
          <p className="app__tagline">Discover new places every day</p>
        </div>
      </header>

      <main className="app__main">
        <TabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === 'saved' ? (
          <>
            <LocationInput onAdd={handleAdd} />
            {locations.length === 0 ? (
              <div className="app__empty">
                <div className="app__empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <p className="app__empty-text">Your saved places will appear here</p>
              </div>
            ) : (
              <ul className="location-list">
                {locations.map((loc) => (
                  <li key={loc.id}>
                    <LocationCard location={loc} onDelete={handleDelete} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="app__empty">
            <div className="app__empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <p className="app__empty-text">
              AI page scanning coming in Phase 3
            </p>
          </div>
        )}
      </main>

      <button className="app__globe-button" onClick={openGlobe}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        Open Globe
      </button>
    </div>
  )
}