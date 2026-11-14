export type LandingEvent =
  | 'landing_view'
  | 'landing_login_click'
  | 'landing_demo_click'
  | 'landing_example_click'

// Anonymous conversion event: never include resumes, account details or IDs.
export function trackLandingEvent(event: LandingEvent) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const source = [
    params.get('utm_source')?.trim(),
    params.get('utm_campaign')?.trim(),
  ]
    .filter(Boolean)
    .join('/')
    .slice(0, 64)
  const body = JSON.stringify(source ? { event, source } : { event })
  const payload = new Blob([body], { type: 'application/json' })
  try {
    // ponytail: a fire-and-forget beacon can be lost or spoofed; it is a
    // directional metric, not a billing count. Add a rate limit only if abused.
    if (navigator.sendBeacon('/api/events', payload)) return
  } catch {
    /* Fall through to fetch for browsers without sendBeacon. */
  }
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
