import posthog from "posthog-js"

/**
 * PostHog product analytics. Initialised once on app boot. The project
 * key + host come from build-time env vars so we can rebuild with or
 * without analytics without touching code:
 *
 *   VITE_POSTHOG_KEY    — project key (`phc_...`). Unset → SDK never
 *                         initialises and all `track()` calls are a
 *                         silent no-op.
 *   VITE_POSTHOG_HOST   — defaults to PostHog EU Cloud
 *                         (https://eu.i.posthog.com), matches our
 *                         eu-west-1 deploy region.
 *
 * Capture strategy:
 *   - Autocapture is ON for clicks + form submits (cheap and useful).
 *   - `capture_pageview: true` so SPA route changes don't need a
 *     manual hook — `posthog.capture('$pageview')` runs on every
 *     `history.pushState`.
 *   - Custom events for the moments we care about: upload start /
 *     succeed / fail, connect to live mode, share-button click, seek.
 */

const KEY = (import.meta.env["VITE_POSTHOG_KEY"] as string | undefined) ?? ""
const HOST =
	(import.meta.env["VITE_POSTHOG_HOST"] as string | undefined) ??
	"https://eu.i.posthog.com"

let enabled = false

export function initAnalytics(): void {
	if (!KEY) return
	if (enabled) return
	posthog.init(KEY, {
		api_host: HOST,
		person_profiles: "identified_only",
		capture_pageview: true,
		autocapture: true,
		defaults: "2025-05-24",
	})
	enabled = true
}

/**
 * Track a custom event. Silent no-op when analytics is disabled
 * (no PostHog key at build time, dev builds, etc.).
 */
export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!enabled) return
	posthog.capture(event, properties)
}
