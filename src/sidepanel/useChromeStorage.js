import { useState, useEffect } from 'react'

/**
 * Reactive wrapper around chrome.storage.sync.
 * Behaves like useState, but reads/writes to Chrome's sync storage —
 * which mirrors data across every Chrome the user is signed into.
 *
 * Quota: 100 KB total, 8 KB per item. Plenty for location lists.
 */
export function useChromeStorage(key, defaultValue) {
  const [value, setValue] = useState(defaultValue)
  const [loaded, setLoaded] = useState(false)

  // Read once on mount
  useEffect(() => {
    chrome.storage.sync.get([key]).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key])
      }
      setLoaded(true)
    })
  }, [key])

  // Write on every change — but only after initial read,
  // so the default value doesn't overwrite the stored one.
  useEffect(() => {
    if (!loaded) return
    chrome.storage.sync.set({ [key]: value })
  }, [key, value, loaded])

  // Listen for changes from other Chrome instances and update locally
  useEffect(() => {
    function handleChange(changes, area) {
      if (area === 'sync' && changes[key]) {
        setValue(changes[key].newValue ?? defaultValue)
      }
    }
    chrome.storage.onChanged.addListener(handleChange)
    return () => chrome.storage.onChanged.removeListener(handleChange)
  }, [key, defaultValue])

  return [value, setValue]
}