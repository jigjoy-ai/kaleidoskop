import type { Participant, PixelCoord } from "./types"

// Circumradius (centre → vertex) of every hex in the grid.
export const HEX_SIZE = 50

// Visual inset on the polygon. The honeycomb math is tight tessellation; this
// shrinks each drawn polygon a touch so adjacent cells render a hairline gap
// instead of merging strokes.
const POLYGON_INSET = 0.955

const SQRT3 = Math.sqrt(3)

interface Axial {
	q: number
	r: number
}

// Cube/axial neighbour directions, ordered so that ringCoords walks each ring
// counter-clockwise starting from the lower-left.
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
	// Start at direction[4] * radius — bottom-left corner of the ring.
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

const RING_COORDS: readonly (readonly Axial[])[] = [
	ringCoords(0),
	ringCoords(1),
	ringCoords(2),
]

export function layoutFor(participant: Participant): PixelCoord {
	const ring = RING_COORDS[participant.ring]
	const coord = ring[participant.ringIndex]
	return axialToPixel(coord)
}

// Pointy-top hex vertices around (cx, cy). The first vertex sits directly
// above the centre, others march clockwise.
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

// Outer ring 2 centres sit at distance 2*sqrt(3)*size from origin.
// Hex vertices stick out an extra `size` past each centre.
// Plus a small padding so the canvas doesn't hug the outermost vertices.
const MAX_EXTENT = 2 * SQRT3 * HEX_SIZE + HEX_SIZE
const PADDING = HEX_SIZE * 0.45
export const VIEWBOX_SIZE = Math.ceil((MAX_EXTENT + PADDING) * 2)
export const VIEWBOX = `${-VIEWBOX_SIZE / 2} ${-VIEWBOX_SIZE / 2} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`
