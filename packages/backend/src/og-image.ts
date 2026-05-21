import type { ParsedRun } from "./audit-log/parser.js"
import type { RunMeta } from "./storage/index.js"

const W = 1200
const H = 630
const SQRT3 = Math.sqrt(3)

/**
 * Render a static SVG OG image for one run. 1200×630 to match the
 * Open Graph spec; serves as both `og:image` and `twitter:image`.
 *
 * Layout: brand text on the right, a 3-ring hex honeycomb on the left
 * with cells coloured by the run's final per-participant lifecycle
 * state — completed (green), partial (purple), absent (faint outline).
 * Story counts beyond ring 2 are aggregated into a "+N more" overlay.
 *
 * Pure SVG, no rasterisation — keeps the backend dependency-free.
 * Slack / Discord / Twitter all render SVG OG images directly; Twitter
 * sometimes prefers PNG but degrades to SVG gracefully.
 */
export function renderOgImage(meta: RunMeta, parsed: ParsedRun): string {
	const stories = parsed.participants.filter((p) => p.role === "story")
	const lifecycleByStoryId = computeLifecycle(parsed)

	// Position the honeycomb at the left third, with hexes sized to fit
	// 3 rings (1 + 6 + 12) inside ~280 px radius.
	const cx = 320
	const cy = H / 2
	const hexSize = 38

	const hexes: string[] = []
	hexes.push(makeHex(cx, cy, hexSize, "#b97bff", 0.95)) // conductor at centre

	// ring 1 — 6 observers (stylistic, not data-driven; fixed teal)
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i - Math.PI / 2
		const x = cx + hexSize * SQRT3 * Math.cos(angle)
		const y = cy + hexSize * SQRT3 * Math.sin(angle)
		hexes.push(makeHex(x, y, hexSize, "#5dd6e8", 0.75))
	}

	// ring 2 — drivers + stories (data-driven colours)
	const ring2Story = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11]
	const ring2Positions = ring2CoordsList()
	for (let i = 0; i < 12; i++) {
		const [hx, hy] = ring2Positions[i]!
		const x = cx + hx * hexSize
		const y = cy + hy * hexSize
		const isDriver = i === 1 || i === 7
		if (isDriver) {
			hexes.push(makeHex(x, y, hexSize, "#7fd97f", 0.55))
		} else {
			const storyIdx = ring2Story.indexOf(i)
			const storyId = stories[storyIdx]?.id
			const life = storyId ? lifecycleByStoryId.get(storyId) : undefined
			hexes.push(makeHex(x, y, hexSize, colorFor(life), opacityFor(life)))
		}
	}

	const moreStories = Math.max(0, stories.length - 10)
	const moreLabel =
		moreStories > 0 ? `+${moreStories} more stories beyond ring 2` : ""

	const durationLabel = formatDuration(meta.durationMs)

	return [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`,
		`<defs>`,
		`<radialGradient id="bg" cx="50%" cy="50%" r="65%">`,
		`<stop offset="0%" stop-color="#1a1421" />`,
		`<stop offset="100%" stop-color="#08060c" />`,
		`</radialGradient>`,
		`<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">`,
		`<feGaussianBlur stdDeviation="6" result="blur" />`,
		`<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>`,
		`</filter>`,
		`</defs>`,
		`<rect width="${W}" height="${H}" fill="url(#bg)" />`,
		`<g filter="url(#glow)">${hexes.join("")}</g>`,
		// brand block on the right
		`<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#f4f1ec">`,
		`<text x="700" y="220" font-size="38" font-weight="700">kaleidoskop</text>`,
		`<text x="700" y="270" font-size="20" opacity="0.55">${esc(meta.id)}</text>`,
		`<text x="700" y="340" font-size="26" fill="#b97bff" opacity="0.95">${meta.eventCount} events  ·  ${meta.storyCount} stories  ·  ${durationLabel}</text>`,
		`<text x="700" y="380" font-size="18" opacity="0.6">${meta.participantCount} participants  ·  captured ${esc(meta.createdAt.slice(0, 10))}</text>`,
		moreLabel
			? `<text x="700" y="430" font-size="16" opacity="0.45">${esc(moreLabel)}</text>`
			: "",
		`<text x="700" y="540" font-size="16" fill="#b97bff" opacity="0.7">jigjoy-ai · mozaik · baro</text>`,
		`</g>`,
		`</svg>`,
	].join("\n")
}

// ---- helpers ----

function makeHex(
	cx: number,
	cy: number,
	size: number,
	color: string,
	opacity: number,
): string {
	const r = size * 0.94
	const points: string[] = []
	for (let i = 0; i < 6; i++) {
		const a = (Math.PI / 3) * i - Math.PI / 2
		points.push(
			`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`,
		)
	}
	return `<polygon points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.4" opacity="${opacity}" />`
}

function ring2CoordsList(): [number, number][] {
	// Generate ring 2 positions in axial space, then convert to the
	// (q, r) → (x, y) pointy-top hex coordinates used by the SVG.
	const out: [number, number][] = []
	// counter-clockwise from bottom-left, matching the frontend's layout
	const axials: [number, number][] = [
		[-2, 2],
		[-1, 2],
		[0, 2],
		[1, 1],
		[2, 0],
		[2, -1],
		[2, -2],
		[1, -2],
		[0, -2],
		[-1, -1],
		[-2, 0],
		[-2, 1],
	]
	for (const [q, r] of axials) {
		out.push([SQRT3 * (q + r / 2), 1.5 * r])
	}
	return out
}

function computeLifecycle(parsed: ParsedRun): Map<string, "completed" | "partial"> {
	const map = new Map<string, "completed" | "partial">()
	for (const e of parsed.events) {
		const id = e.sourceId
		if (e.domain === "agent_state") {
			const phase = (e.data?.["phase"] ?? "") as string
			if (phase === "done" || phase === "failed" || phase === "aborted") {
				map.set(id, "completed")
				continue
			}
		}
		if (e.domain === "story_result") {
			map.set(id, "completed")
			continue
		}
		if (map.get(id) !== "completed") map.set(id, "partial")
	}
	return map
}

function colorFor(life: "completed" | "partial" | undefined): string {
	if (life === "completed") return "#7fd97f"
	if (life === "partial") return "#b97bff"
	return "#39394a"
}

function opacityFor(life: "completed" | "partial" | undefined): number {
	if (life === "completed") return 0.95
	if (life === "partial") return 0.7
	return 0.18
}

function formatDuration(ms: number): string {
	const sec = Math.round(ms / 1000)
	const m = Math.floor(sec / 60)
	const s = sec % 60
	return `${m}:${s.toString().padStart(2, "0")}`
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}
