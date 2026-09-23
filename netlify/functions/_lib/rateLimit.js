/**
 * Per-IP fixed-window rate limiting, shared by the functions.
 *
 * State is an in-memory Map, so it only holds within a single warm function
 * instance — fine for `netlify dev` and a useful brake against a runaway loop
 * in the extension. Production would need a shared store (Redis, Upstash).
 */

const WINDOW_MS = 60_000

// endpoint -> Map<clientKey, { count, resetAt }>
const buckets = new Map()

/**
 * Identify the caller. Netlify lowercases incoming header names.
 * `x-forwarded-for` may be a proxy chain — the original client is first.
 */
export function clientKey(event) {
  const headers = event.headers || {}
  const forwarded = headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim() || 'anon'
  }
  return headers['client-ip'] || 'anon'
}

/**
 * Count one request against `endpoint`'s budget for this client.
 * Returns { allowed, retryAfter } — retryAfter is in seconds.
 */
export function checkRateLimit(endpoint, key, limit) {
  let bucket = buckets.get(endpoint)
  if (!bucket) {
    bucket = new Map()
    buckets.set(endpoint, bucket)
  }

  const now = Date.now()
  const entry = bucket.get(key)

  if (!entry || now >= entry.resetAt) {
    bucket.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfter: 0 }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }

  entry.count += 1
  return { allowed: true, retryAfter: 0 }
}
