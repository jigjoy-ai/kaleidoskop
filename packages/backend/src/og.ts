import type { RunMeta } from "./storage/index.js"

const OG_BLOCK_RE = /<!-- OG_META_START -->[\s\S]*?<!-- OG_META_END -->/

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}

function formatDuration(ms: number): string {
	const totalSec = Math.round(ms / 1000)
	const m = Math.floor(totalSec / 60)
	const s = totalSec % 60
	return `${m}:${s.toString().padStart(2, "0")}`
}

export interface OgRenderInput {
	runId: string
	publicOrigin: string
	meta: RunMeta | null
}

/**
 * Replace the placeholder OG meta block in the built index.html with
 * run-specific metadata. The frontend template wraps its default tags
 * in `<!-- OG_META_START -->` / `<!-- OG_META_END -->` so we can swap
 * the whole block in one regex.
 *
 * Falls back to the default block if `meta` is null — keeps the page
 * working when a run id isn't found in storage (the SPA itself will
 * still render and show the 404 inside the client).
 */
export function injectOgMeta(tpl: string, input: OgRenderInput): string {
	const block = buildBlock(input)
	return tpl.replace(OG_BLOCK_RE, block)
}

function buildBlock({ runId, publicOrigin, meta }: OgRenderInput): string {
	const url = `${publicOrigin}/r/${encodeURIComponent(runId)}`
	// Use the per-run dynamic OG SVG when meta is available — Slack /
	// Discord / Twitter all render SVG OG images. Fall back to the
	// static brand SVG when meta is missing (e.g. run not in storage).
	const ogImage = meta
		? `${publicOrigin}/api/runs/${encodeURIComponent(runId)}/og.svg`
		: `${publicOrigin}/og-image.svg`

	const title = meta
		? `Replay ${runId} — ${meta.eventCount} events · ${meta.storyCount} stories · ${formatDuration(meta.durationMs)}`
		: `Replay ${runId} — mozaik-replay`
	const desc = meta
		? `${meta.participantCount} participants, ${meta.eventCount} bus events, captured ${meta.createdAt.slice(0, 10)}. Replay every Mozaik fan-out in the agent honeycomb.`
		: `mozaik-replay session ${runId}. Replay every Mozaik fan-out in the agent honeycomb.`

	const t = escapeHtml(title)
	const d = escapeHtml(desc)
	const u = escapeHtml(url)
	const img = escapeHtml(ogImage)

	return [
		"<!-- OG_META_START -->",
		`    <title>${t}</title>`,
		`    <meta name="description" content="${d}" />`,
		`    <meta property="og:type" content="website" />`,
		`    <meta property="og:title" content="${t}" />`,
		`    <meta property="og:description" content="${d}" />`,
		`    <meta property="og:image" content="${img}" />`,
		`    <meta property="og:url" content="${u}" />`,
		`    <meta name="twitter:card" content="summary_large_image" />`,
		`    <meta name="twitter:title" content="${t}" />`,
		`    <meta name="twitter:description" content="${d}" />`,
		`    <meta name="twitter:image" content="${img}" />`,
		"    <!-- OG_META_END -->",
	].join("\n")
}
