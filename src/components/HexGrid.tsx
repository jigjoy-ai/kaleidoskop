import { useMemo } from "react"
import { PARTICIPANTS } from "../lib/participants"
import { VIEWBOX, layoutFor } from "../lib/hexLayout"
import { EVENT_COLOR } from "../lib/eventColor"
import { useReplayClock } from "../lib/replayClock"
import { EdgeFlash } from "./EdgeFlash"
import { HexParticipant } from "./HexParticipant"
import type { PixelCoord } from "../lib/types"

// We don't draw idle bus edges. The tessellated honeycomb implies the topology
// at rest, and events punch through as discrete sparks on top of the cells.

export function HexGrid() {
	const firing = useReplayClock((s) => s.firing)
	const activeEdges = useReplayClock((s) => s.activeEdges)

	const positions = useMemo(() => {
		const map = new Map<string, PixelCoord>()
		for (const p of PARTICIPANTS) map.set(p.id, layoutFor(p))
		return map
	}, [])

	return (
		<div
			className="w-full h-full"
			style={{ transform: "rotate(-4deg)", transformOrigin: "center center" }}
		>
			<svg
				viewBox={VIEWBOX}
				className="w-full h-full"
				preserveAspectRatio="xMidYMid meet"
				role="img"
				aria-label="Mozaik participants laid out as a tessellated hexagonal honeycomb"
			>
				<defs>
					<linearGradient id="hex-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#181822" />
						<stop offset="100%" stopColor="#0d0d15" />
					</linearGradient>
					<radialGradient id="bg-glow" cx="50%" cy="50%" r="60%">
						<stop offset="0%" stopColor="#1c1c2a" stopOpacity="0.55" />
						<stop offset="100%" stopColor="#0a0a0f" stopOpacity="0" />
					</radialGradient>
				</defs>

				<rect
					x={-1000}
					y={-1000}
					width={2000}
					height={2000}
					fill="url(#bg-glow)"
				/>

				<g>
					{PARTICIPANTS.map((participant) => {
						const pos = positions.get(participant.id)!
						const firedAt = firing[participant.id]
						let firingColor: string | null = null
						if (firedAt !== undefined) {
							for (let i = activeEdges.length - 1; i >= 0; i--) {
								const e = activeEdges[i]
								if (
									e.sourceId === participant.id ||
									e.targetId === participant.id
								) {
									firingColor = EVENT_COLOR[e.type]
									break
								}
							}
						}
						return (
							<HexParticipant
								key={participant.id}
								participant={participant}
								pos={pos}
								firingColor={firingColor}
							/>
						)
					})}
				</g>

				<g>
					{activeEdges.map((event) => {
						const from = positions.get(event.sourceId)
						const to = positions.get(event.targetId)
						if (!from || !to) return null
						return (
							<EdgeFlash key={event.id} event={event} from={from} to={to} />
						)
					})}
				</g>
			</svg>
		</div>
	)
}

