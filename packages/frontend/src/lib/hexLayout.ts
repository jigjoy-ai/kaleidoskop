import type { Participant, PixelCoord } from "./types"

// Circumradius (centre → vertex) of every hex in the grid.
export const HEX_SIZE = 48

// Visual inset on the polygon. The honeycomb math is tight tessellation; this
// shrinks each drawn polygon a touch so adjacent cells render a hairline gap
// instead of merging strokes.
const POLYGON_INSET = 0.955

const SQRT3 = Math.sqrt(3)

interface Axial {
	q: number
	r: number
}

const CUBE_DIRECTIONS: readonly Axial[] = [
	{ q: +1, r: 0 },
	{ q: +1, r: -1 },
	{ q: 0, r: -1 },
	{ q: -1, r: 0 },
	{ q: -1, r: +1 },
	{ q: 0, r: +1 },
]

function ringCoords(radius: number): Axial[] {
	if (radius === 0) return [{ q: 0, r: 0 }]
	const results: Axial[] = []
	let hex: Axial = {
		q: CUBE_DIRECTIONS[4].q * radius,
		r: CUBE_DIRECTIONS[4].r * radius,
	}
	for (let side = 0; side < 6; side++) {
		for (let step = 0; step < radius; step++) {
			results.push({ ...hex })
			hex = {
				q: hex.q + CUBE_DIRECTIONS[side].q,
				r: hex.r + CUBE_DIRECTIONS[side].r,
			}
		}
	}
	return results
}

// Pointy-top axial → pixel.
function axialToPixel(coord: Axial, size = HEX_SIZE): PixelCoord {
	return {
		x: size * SQRT3 * (coord.q + coord.r / 2),
		y: size * 1.5 * coord.r,
	}
}

// Cache ring coords on demand. We support arbitrary ring depth; the demo
// only needs 0..2, live runs with 33 stories reach into ring 4.
const RING_CACHE = new Map<number, readonly Axial[]>()

function getRingCoords(radius: number): readonly Axial[] {
	const cached = RING_CACHE.get(radius)
	if (cached) return cached
	const coords = ringCoords(radius)
	RING_CACHE.set(radius, coords)
	return coords
}

/**
 * Pixel position for a hex at (ring, ringIndex). Supports any ring depth
 * — the underlying coord generator is open-ended. Out-of-bounds
 * ringIndex falls back to {0,0} (centre) rather than throwing because
 * the layout invariant is enforced at participant-list construction
 * time; if a participant slipped through with a bad index, putting it at
 * centre is less violent than crashing the SVG render.
 */
export function layoutFor(ring: number, ringIndex: number): PixelCoord {
	const coords = getRingCoords(ring)
	const coord = coords[ringIndex] ?? coords[0] ?? { q: 0, r: 0 }
	return axialToPixel(coord)
}

export function layoutForParticipant(p: Participant): PixelCoord {
	return layoutFor(p.ring, p.ringIndex)
}

// Pointy-top hex vertices around (cx, cy). The first vertex sits directly
// above centre, others march clockwise.
export function hexVertices(cx: number, cy: number, size = HEX_SIZE): string {
	const r = size * POLYGON_INSET
	const points: string[] = []
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i - Math.PI / 2
		points.push(
			`${(cx + r * Math.cos(angle)).toFixed(3)},${(cy + r * Math.sin(angle)).toFixed(3)}`,
		)
	}
	return points.join(" ")
}

const PADDING = HEX_SIZE * 0.45

/**
 * Compute the SVG viewBox dimension for a honeycomb with this many rings.
 * Used by the dynamic layout in the store so demo (ring 2 max) renders
 * larger hexes than a 33-story run (ring 4 max).
 */
export function viewBoxSizeFor(maxRing: number): number {
	// Outer extent in pixels: ring `r` has hex centres at distance
	// `r * HEX_SIZE * sqrt(3)` for the outermost slot in flat directions
	// and `r * HEX_SIZE * 1.5` vertically. Take the bigger of the two
	// and add a hex radius worth of margin so the outermost polygons
	// don't kiss the SVG edge.
	const extent =
		Math.max(maxRing * HEX_SIZE * SQRT3, maxRing * HEX_SIZE * 1.5) +
		HEX_SIZE
	return Math.ceil((extent + PADDING) * 2)
}

/** Pre-baked viewBox string for the scripted demo (3 rings: 0..2). */
const DEMO_VIEWBOX_SIZE = viewBoxSizeFor(2)
export const VIEWBOX_SIZE = DEMO_VIEWBOX_SIZE
export const VIEWBOX = `${-DEMO_VIEWBOX_SIZE / 2} ${-DEMO_VIEWBOX_SIZE / 2} ${DEMO_VIEWBOX_SIZE} ${DEMO_VIEWBOX_SIZE}`

export function viewBoxFor(maxRing: number): string {
	const size = viewBoxSizeFor(maxRing)
	return `${-size / 2} ${-size / 2} ${size} ${size}`
}
