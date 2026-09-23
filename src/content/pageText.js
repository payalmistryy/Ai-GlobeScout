/**
 * On-demand page text reader.
 *
 * Injected by the side panel via chrome.scripting.executeScript when the user
 * clicks "Scan this page" — deliberately NOT declared under content_scripts,
 * so it never runs on pages the user didn't ask to scan.
 *
 * Plain classic script: no imports, no build-time transforms, runs as-is.
 */
;(function () {
  // executeScript re-runs this file on every scan of the same tab. Register the
  // listener once so a second scan doesn't get duplicate responses.
  if (window.__globescoutPageTextReady) return
  window.__globescoutPageTextReady = true

  var MAX_CHARS = 12000
  var MIN_CHARS = 200

  // Chrome/site furniture that adds noise without adding destinations.
  var NOISE_SELECTOR = [
    'script',
    'style',
    'noscript',
    'nav',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
  ].join(',')

  // Elements whose boundaries should read as line breaks.
  var BLOCK_SELECTOR =
    'p,div,section,article,header,main,h1,h2,h3,h4,h5,h6,li,tr,br,blockquote,pre,figcaption'

  function readPageText() {
    if (!document.body) return ''

    var clone = document.body.cloneNode(true)

    var noise = clone.querySelectorAll(NOISE_SELECTOR)
    for (var i = 0; i < noise.length; i++) {
      noise[i].remove()
    }

    // A detached clone isn't rendered, so `innerText` falls back to
    // textContent semantics — which runs blocks together ("ParisFrance").
    // Append explicit newlines at block boundaries to restore the breaks.
    var blocks = clone.querySelectorAll(BLOCK_SELECTOR)
    for (var j = 0; j < blocks.length; j++) {
      blocks[j].appendChild(document.createTextNode('\n'))
    }

    var text = clone.innerText || clone.textContent || ''

    return text
      .replace(/\r/g, '')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_CHARS)
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message && message.type === 'extract-page-text') {
      var text = readPageText()
      if (text.length < MIN_CHARS) {
        sendResponse({ ok: false, reason: 'no-content' })
      } else {
        sendResponse({
          ok: true,
          text: text,
          url: location.href,
          title: document.title,
        })
      }
    }
    // Responding synchronously — no need to hold the channel open.
  })
})()
