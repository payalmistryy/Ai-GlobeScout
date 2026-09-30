# AI GlobeScout

A Chrome extension that finds the places worth visiting on any page you're reading, and puts them on a 3D globe.

## What it does

- **Browse anywhere.** Reading a travel blog, a Wikipedia article, a forum thread — the extension works against whatever page is open.
- **Scan the page.** One click sends the page's readable text to Claude, which returns the travel destinations it mentions, disambiguated from context: Washington the city, not the state or the person.
- **Save what you like.** Saving a result geocodes it to real coordinates and adds it to your bucket list, which syncs across every Chrome you're signed into.
- **Explore on a globe.** Saved places appear as pins on a topographic 3D globe. Click one to fly the camera there and open an insight panel: local time and current weather alongside why the place is notable, when to go, and a hidden gem nearby.

## Tech stack

| Area | Built with |
|---|---|
| Extension | Manifest V3, React 19, Vite, CRXJS |
| 3D | CesiumJS, Cesium World Terrain |
| Backend | Netlify Functions |
| AI | Anthropic Claude (Messages API) |
| Data | `chrome.storage.sync`, Open-Meteo, Cesium ion geocoding |

## Architecture highlights

**Cesium runs in a sandboxed iframe.** Manifest V3 enforces a strict content security policy on extension pages, and Cesium needs `eval` to compile shaders — so it cannot run on a privileged page at all. The globe therefore lives in a sandboxed page that the CSP exempts, and the privileged wrapper talks to it over `postMessage`. The wrapper owns everything the sandbox can't reach: `chrome.storage`, network calls, the insight panel. The sandbox owns rendering and reports user intent back up, such as which pin was clicked. A small Vite plugin strips Cesium's injected script tag from every page except the sandbox, so it loads in exactly one place.

**API keys never reach the bundle.** An extension bundle is readable by anyone who installs it, so the Anthropic key and the Cesium ion token stay server-side behind Netlify Functions. The extension calls `/geocode`, `/extract`, `/insights`, and `/live`; the functions hold the credentials and proxy upstream. This also gives one place to enforce per-IP rate limits and to degrade failures into something the UI can show — every upstream problem becomes a 503 carrying a machine-readable reason, so the sidebar can say "too many scans in the last minute" rather than leaking a provider error.

**Two surfaces, one source of truth.** The sidebar is for managing a list; the full-tab globe is for looking at it. Both read the same `chrome.storage.sync` key through a hook that subscribes to `chrome.storage.onChanged`, so saving a place in the sidebar makes its pin appear on the globe with no refresh and no message passing between them. Cross-surface actions that aren't state, such as "fly to this place," travel through `chrome.storage.local` as a request the globe consumes on arrival.

## Local development

Requires Node 20+, a Cesium ion token, and an Anthropic API key.

```sh
git clone https://github.com/payalmistryy/Ai-GlobeScout.git
cd Ai-GlobeScout
npm install
```

Create `.env.local` for the frontend. The ion token here is used only by the Cesium sandbox, for terrain streaming:

```sh
VITE_CESIUM_ION_TOKEN=your_ion_token
VITE_API_BASE_URL=http://localhost:8888
```

Create `.env` for the backend. These stay server-side:

```sh
ANTHROPIC_API_KEY=your_anthropic_key
CESIUM_ION_TOKEN=your_ion_token
```

Run the backend in one terminal:

```sh
npm run backend        # netlify dev on :8888
```

And the build in another:

```sh
npm run build          # required for globe, sandbox, background, or manifest changes
npm run dev            # sidebar-only work, with HMR
```

Then load the extension: open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`. After a rebuild, hit reload on the extension card.

## Known limitations and roadmap

- **Cross-browser sync.** Storage is `chrome.storage.sync`, which is scoped to the signed-in Chrome profile. Moving persistence to Firebase would let one bucket list follow a user across browsers and devices. Deferred.
- **Safari port.** Safari has no side panel API, so the sidebar would become a toolbar popup, and Cesium's sandbox needs revisiting under Safari's extension model. Prototyped and deferred.
- **Rate limiting is per-instance.** The limiter keeps its counters in an in-memory `Map`, which is correct for local development but resets on cold start and isn't shared between concurrent function instances. Production would move it to Netlify Blobs or similar.

## Author

Payal Mistry — [payalmistry.com](https://payalmistry.com)
