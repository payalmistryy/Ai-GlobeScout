import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GlobePage from './GlobePage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobePage />
  </StrictMode>
)