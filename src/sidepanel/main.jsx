import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div style={{ padding: '1rem', fontFamily: 'system-ui' }}>
      <h1>🌍 GlobeScout</h1>
      <p>Sidebar is alive. Globe coming soon.</p>
    </div>
  </StrictMode>
)