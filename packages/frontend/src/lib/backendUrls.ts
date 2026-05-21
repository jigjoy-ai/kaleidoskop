/**
 * Backend URL helpers. Reads VITE_REPLAY_BACKEND_HTTP_URL +
 * VITE_REPLAY_BACKEND_WS_URL at build time; falls back to localhost so
 * `npm run dev` works without env setup. Production builds set both to
 * the deployed origin (e.g. `https://replay.baro.rs` / `wss://...`).
 */
const HTTP_BASE =
	(import.meta.env["VITE_REPLAY_BACKEND_HTTP_URL"] as string | undefined) ??
	"http://localhost:8787"

const WS_BASE =
	(import.meta.env["VITE_REPLAY_BACKEND_WS_URL"] as string | undefined) ??
	"ws://localhost:8787"

export function backendHttp(path: string): string {
	return HTTP_BASE.replace(/\/+$/, "") + path
}

export function backendWsForRun(runId: string): string {
	return `${WS_BASE.replace(/\/+$/, "")}/api/runs/${encodeURIComponent(runId)}/stream`
}
