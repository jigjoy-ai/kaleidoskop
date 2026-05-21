/**
 * Backend URL helpers.
 *
 * Resolution order for the HTTP / WS base URL:
 *   1. Build-time env vars (escape hatch — e.g. point a staging
 *      frontend at a prod backend, or vice versa):
 *        VITE_KALEIDOSKOP_BACKEND_HTTP_URL
 *        VITE_KALEIDOSKOP_BACKEND_WS_URL
 *   2. Runtime current origin when running in a browser on a non-
 *      localhost host (production: the backend serves both the SPA
 *      and the API on the same origin via fastify-static + nginx).
 *   3. Hard-coded localhost:8787 for `npm run dev` against the local
 *      backend (frontend Vite dev server is on :5173, backend is on
 *      :8787, so the dev environment NEEDS an absolute URL — relative
 *      paths would hit Vite instead).
 */
const ENV_HTTP =
	(import.meta.env["VITE_KALEIDOSKOP_BACKEND_HTTP_URL"] as string | undefined) ??
	""
const ENV_WS =
	(import.meta.env["VITE_KALEIDOSKOP_BACKEND_WS_URL"] as string | undefined) ??
	""

function isLocalhost(host: string | undefined): boolean {
	if (!host) return true
	return (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host.endsWith(".local")
	)
}

function defaultHttpBase(): string {
	if (typeof window === "undefined") return "http://localhost:8787"
	return isLocalhost(window.location.hostname)
		? "http://localhost:8787"
		: window.location.origin
}

function defaultWsBase(): string {
	if (typeof window === "undefined") return "ws://localhost:8787"
	const host = window.location.hostname
	if (isLocalhost(host)) return "ws://localhost:8787"
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
	return `${proto}//${window.location.host}`
}

const HTTP_BASE = ENV_HTTP || defaultHttpBase()
const WS_BASE = ENV_WS || defaultWsBase()

export function backendHttp(path: string): string {
	return HTTP_BASE.replace(/\/+$/, "") + path
}

export function backendWsForRun(runId: string): string {
	return `${WS_BASE.replace(/\/+$/, "")}/api/runs/${encodeURIComponent(runId)}/stream`
}
