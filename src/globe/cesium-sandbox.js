import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
Cesium.Ion.defaultAccessToken = ionToken

let viewer = null
let locations = []

// Render a readable message instead of a silent black starfield when the
// globe can't initialize (almost always a token problem).
function showError(message) {
  const el = document.getElementById('cesiumContainer')
  if (el) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8BA3C7;font-family:system-ui;font-size:14px;text-align:center;padding:2rem;">
        ${message}
      </div>
    `
  }
  console.warn('[GlobeScout]', message)
}

async function initViewer() {
  if (viewer) return

  // Case 1: token missing/empty — nothing set in .env.local.
  if (!ionToken) {
    showError('Missing Cesium ion token — set VITE_CESIUM_ION_TOKEN in .env.local, then rebuild.')
    return
  }

  // Case 2: token present but rejected by Ion (401) — e.g. wrong/expired token
  // or missing the assets:read scope. Probe asset 1 (Cesium World Terrain),
  // the same endpoint terrain + imagery need.
  try {
    await Cesium.IonResource.fromAssetId(1)
  } catch {
    showError('Cesium ion token was rejected — confirm it has the assets:read scope, then rebuild.')
    return
  }

  viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
  })

  viewer.cesiumWidget.creditContainer.style.display = 'none'
  viewer.scene.globe.enableLighting = true

  // Tell the parent we're ready to receive location data
  window.parent.postMessage({ type: 'cesium-ready' }, '*')
}

// Listen for messages from the parent (the wrapper page)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'set-locations') {
    locations = event.data.locations
    // Pin rendering comes in step 2B.5
  }
})

initViewer()