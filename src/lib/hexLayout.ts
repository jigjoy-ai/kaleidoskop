import type { Participant, PixelCoord } from "./types"

export const HEX_RADIUS = 44

// Flat-top hex geometry.
//   Center-to-vertex distance = HEX_RADIUS
//   Width (vertex to vertex horizontally)  = 2 * HEX_RADIUS
//   Height (flat edge to flat edge)        = sqrt(3) * HEX_RADIUS
//   Adjacent center-to-center distance     = sqrt(3) * HEX_RADIUS
const SQRT3 = Math.sqrt(3)

// Hex polygon vertices around a center (cx, cy), flat-top orientation.
export function hexVertices(cx: number, cy: number, r = HEX_RADIUS): string {
	const points: string[] = []
	for (let i = 0; i < 6; i++) {
		const angle = (i * Math.PI) / 3
		points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
	}
	return points.join(" ")
}

// Place a participant in 2D space using polar coordinates per ring.
// Ring 0 (center): origin.
// Ring 1 (6 hexes): evenly spaced around origin, starting at top (rotated 30° so a
//                   hex sits directly above center rather than at a vertex).
// Ring 2 (12 hexes): same starting angle, twice the radius.
export function layoutFor(participant: Participant): PixelCoord {
	if (participant.ring === 0) return { x: 0, y: 0 }

	const count = participant.ring === 1 ? 6 : 12
	const radius =
		participant.ring === 1
			? SQRT3 * HEX_RADIUS * 1.05
			: 2 * SQRT3 * HEX_RADIUS * 1.05

	// Rotate by -90° so index 0 is at the top.
	// Add a small per-ring phase shift so ring 2 nests in the gaps of ring 1.
	const phaseShift = participant.ring === 2 ? Math.PI / 12 : 0
	const theta =
		-Math.PI / 2 + (participant.ringIndex / count) * 2 * Math.PI + phaseShift

	return {
		x: radius * Math.cos(theta),
		y: radius * Math.sin(theta),
	}
}

// SVG viewBox dimensions chosen to comfortably contain ring 2 plus hex radius.
export const VIEWBOX_SIZE = 580
export const VIEWBOX = `${-VIEWBOX_SIZE / 2} ${-VIEWBOX_SIZE / 2} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`
