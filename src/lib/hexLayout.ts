// Hex polygon math used by HexParticipant. Positioning of nodes in the canvas
// is owned by the force-directed layout (lib/forceLayout.ts) — there's no
// ring-based layoutFor anymore.

const POLYGON_INSET = 0.96
const SQRT3 = Math.sqrt(3)

export const SQRT3_CONST = SQRT3

// Pointy-top hex vertices around (cx, cy). The first vertex sits directly
// above centre, others march clockwise.
export function hexVertices(cx: number, cy: number, size: number): string {
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
