// Mirrors geocode.js: the API key lives behind the Netlify proxy, never in
// the extension bundle.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8888'
const EXTRACT_ENDPOINT = `${API_BASE_URL}/.netlify/functions/extract`

const CONTENT_SCRIPT = 'src/content/pageText.js'

// Pages Chrome refuses to let an extension script.
const UNSCRIPTABLE_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'devtools://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
]

const BROWSER_PAGE_ERROR = "Can't scan this page (browser page)"
const NO_CONTENT_ERROR = 'This page has no readable content to scan'
const GENERIC_ERROR = "Couldn't scan this page"

// The proxy degrades every Anthropic-side failure to a 503 carrying a reason;
// the underlying cause is never exposed, so map it to something actionable.
const REASON_MESSAGES = {
  auth: 'AI extraction temporarily unavailable — check back soon',
  rate_limit: 'Too many scans in the last minute, wait a moment',
  upstream: 'AI extraction temporarily unavailable',
}

/**
 * Read the active tab's text and extract travel destinations from it.
 * Returns { locations, url, title }; throws an Error with a message meant for
 * direct display in the side panel.
 */
export async function extractLocationsFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    throw new Error(BROWSER_PAGE_ERROR)
  }
  if (UNSCRIPTABLE_PREFIXES.some((prefix) => (tab.url || '').startsWith(prefix))) {
    throw new Error(BROWSER_PAGE_ERROR)
  }

  // Injection and messaging both fail on restricted pages that slipped past
  // the prefix check (a redirect, a missing host permission).
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [CONTENT_SCRIPT],
    })
  } catch {
    throw new Error(BROWSER_PAGE_ERROR)
  }

  let page
  try {
    page = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page-text' })
  } catch {
    throw new Error(BROWSER_PAGE_ERROR)
  }

  if (!page?.ok) {
    throw new Error(NO_CONTENT_ERROR)
  }

  let response
  try {
    response = await fetch(EXTRACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: page.text }),
    })
  } catch {
    throw new Error(REASON_MESSAGES.upstream)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // Fall through to the status handling below.
  }

  if (response.status === 503) {
    throw new Error(REASON_MESSAGES[data?.reason] || REASON_MESSAGES.upstream)
  }
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(GENERIC_ERROR)
  }

  return { locations: data, url: page.url, title: page.title }
}
