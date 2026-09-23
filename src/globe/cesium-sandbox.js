import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN

// Guard: surface a readable error if the token is missing/empty
if (!Cesium.Ion.defaultAccessToken) {
  document.getElementById('cesiumContainer').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9096A0;font-family:system-ui;font-size:13px;text-align:center;padding:2rem;">
      Missing Cesium ion token — check VITE_CESIUM_ION_TOKEN in .env.local
    </div>
  `
  throw new Error('Cesium ion token not provided')
}

// Pulse config — one slow, low-contrast ring. Restraint over spectacle.
const PULSE_DURATION_SEC = 3.2
const RING_BASE = 5 // ring start diameter (px)
const RING_GROWTH = 26 // px added as the ring expands
const HALO_COLOR = Cesium.Color.fromCssColorString('#FFFFFF')
const LABEL_BG = Cesium.Color.fromCssColorString('#08090B').withAlpha(0.62)
const LABEL_TEXT = Cesium.Color.fromCssColorString('#ECEDEF')
const LABEL_OUTLINE = Cesium.Color.fromCssColorString('#000000').withAlpha(0.5)

// Draw the marker once to a high-res canvas so it stays crisp when scaled down
// (a Cesium `point` looks blocky up close). Flat by design: an opaque disc, a
// crisp white rim, and a soft shadow for separation on bright terrain — no
// gloss, no sheen, no glow.
function makePin(size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const r = size * 0.19

  // Soft contact shadow so the marker reads over light imagery
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = size * 0.07
  ctx.shadowOffsetY = size * 0.012
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.fillStyle = '#7FA9FF'
  ctx.fill()
  ctx.restore()

  // Crisp white rim
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.lineWidth = size * 0.022
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'
  ctx.stroke()

  return canvas
}
const PIN_IMG = makePin()
const PIN_SCALE = 0.22

let viewer = null
let locations = []
let hasFramedOnce = false
let pulseStartTime = null
// While the camera is flying, freeze the pulse so the GPU/CPU can focus on
// streaming terrain (keeps the flight smooth).
let isFlying = false

// Shared 0→1 ramp for the pulse, with an optional phase offset so multiple
// rings can stagger. All pins read the same clock, so they pulse in unison.
function pulsePhase(time, offset = 0) {
  const elapsed = Cesium.JulianDate.secondsDifference(time, pulseStartTime)
  return ((elapsed / PULSE_DURATION_SEC) + offset + 1) % 1
}

function initViewer() {
  if (viewer) return

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
  // Keep more terrain tiles cached so flying back to a place is instant.
  viewer.scene.globe.tileCacheSize = 1000
  // Ensure the clock advances so the time-driven pulse animates.
  viewer.clock.shouldAnimate = true

  // Establish a shared start time so all pins pulse in sync.
  pulseStartTime = Cesium.JulianDate.now()

  // Click a pin → fly the camera to that location. Only the core/glow are
  // valid targets (the big expanding rings are excluded so they can't hijack a
  // click meant for a different, nearby pin).
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((click) => {
    const picks = viewer.scene.drillPick(click.position, 8)
    const hit = picks.find(
      (p) => p.id && typeof p.id.id === 'string' && locations.some((l) => l.id === p.id.id)
    )
    if (hit && hit.id.position) {
      const position = hit.id.position.getValue(viewer.clock.currentTime)
      if (position) flyToPosition(position)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  window.parent.postMessage({ type: 'cesium-ready' }, '*')
}

/**
 * Smoothly fly the camera to a saved place, framed with a gentle tilt so the
 * topography reads in 3D.
 */
function flyToPosition(position) {
  if (!viewer) return
  isFlying = true

  // Pre-warm: request detailed terrain at the destination so it streams in
  // during the flight rather than popping in on arrival.
  const carto = Cesium.Cartographic.fromCartesian(position)
  Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]).catch(() => {})

  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(position, 1000), {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 300000),
    duration: 1.2,
    complete: () => {
      isFlying = false
    },
    cancel: () => {
      isFlying = false
    },
  })
}

// One expanding, fading ring (hollow). `offset` shifts its phase.
function addRing(loc, position, offset) {
  viewer.entities.add({
    id: `${loc.id}-halo${offset === 0 ? '' : '2'}`,
    position,
    point: {
      pixelSize: new Cesium.CallbackProperty((time) => {
        if (isFlying) return 0
        const phase = pulsePhase(time, offset)
        const eased = 1 - Math.pow(1 - phase, 3) // ease-out: quick then settles
        return RING_BASE + eased * RING_GROWTH
      }, false),
      color: Cesium.Color.TRANSPARENT, // hollow — only the outline shows
      outlineColor: new Cesium.CallbackProperty((time) => {
        if (isFlying) return Cesium.Color.TRANSPARENT
        const phase = pulsePhase(time, offset)
        return HALO_COLOR.withAlpha(0.3 * Math.pow(1 - phase, 1.5))
      }, false),
      outlineWidth: 1,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
}

/**
 * Each location is built from stacked entities at the same coordinates:
 *   - one slow expanding ring (a quiet locator pulse)
 *   - a flat marker billboard + label
 */
function renderPins() {
  if (!viewer) return

  viewer.entities.removeAll()

  locations.forEach((loc) => {
    if (typeof loc.longitude !== 'number' || typeof loc.latitude !== 'number') {
      console.warn(
        `[GlobeScout] Skipping "${loc.name}" — no coordinates. Delete and re-add it to geocode.`
      )
      return
    }

    const position = Cesium.Cartesian3.fromDegrees(loc.longitude, loc.latitude)

    // A single ring — one calm ping rather than a continuous radar sweep.
    addRing(loc, position, 0)

    // Flat marker (crisp billboard) + label
    viewer.entities.add({
      id: loc.id,
      name: loc.name,
      position,
      billboard: {
        image: PIN_IMG,
        scale: PIN_SCALE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: loc.name,
        font: '500 12px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
        fillColor: LABEL_TEXT,
        outlineColor: LABEL_OUTLINE,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -13),
        showBackground: true,
        backgroundColor: LABEL_BG,
        backgroundPadding: new Cesium.Cartesian2(7, 4),
        scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 4.0e7, 0.0),
        translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 4.0e7, 0.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  })

  // On the first render that has actual pins, frame them.
  if (!hasFramedOnce && viewer.entities.values.length > 0) {
    hasFramedOnce = true
    viewer.zoomTo(viewer.entities, new Cesium.HeadingPitchRange(0, -Math.PI / 4, 0))
  }
}

// Listen for messages from the parent (the wrapper page)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'set-locations') {
    locations = event.data.locations || []
    renderPins()
  } else if (event.data?.type === 'fly-to') {
    // Triggered by clicking a place in the sidebar — fly to exact coordinates.
    const { longitude, latitude } = event.data
    if (typeof longitude === 'number' && typeof latitude === 'number') {
      flyToPosition(Cesium.Cartesian3.fromDegrees(longitude, latitude))
    }
  }
})

initViewer()
