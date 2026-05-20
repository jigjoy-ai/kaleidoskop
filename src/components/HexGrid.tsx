import { useMemo } from "react"
import { EDGES, PARTICIPANTS, PARTICIPANT_BY_ID } from "../lib/participants"
import { layoutFor, VIEWBOX } from "../lib/hexLayout"
import { EVENT_COLOR } from "../lib/eventColor"
import { useReplayClock } from "../lib/replayClock"
import { EdgeLine } from "./EdgeLine"
import { EdgeFlash } from "./EdgeFlash"
import { HexParticipant } from "./HexParticipant"
import type { PixelCoord } from "../lib/types"

export function HexGrid() {
	const firing = useReplayClock((s) => s.firing)
	const activeEdges = useReplayClock((s) => s.activeEdges)

	const positions = useMemo(() => {
		const map = new Map<string, PixelCoord>()
		for (const p of PARTICIPANTS) map.set(p.id, layoutFor(p))
		return map
	}, [])

	return (
		<svg
			viewBox={VIEWBOX}
			className="w-full h-full"
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label="Mozaik participants laid out as a hexagonal grid"
		>
			<g>
				{EDGES.map((edge, i) => {
					const from = positions.get(edge.sourceId)
					const to = positions.get(edge.targetId)
					if (!from || !to) return null
					return <EdgeLine key={`edge-${i}`} from={from} to={to} />
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
			<g>
				{PARTICIPANTS.map((participant) => {
					const pos = positions.get(participant.id)!
					const firedAt = firing[participant.id]
					// Determine color of the most recent flash that touched this node
					// by scanning recent active edges in reverse — cheap given MAX_RECENT.
					let firingColor: string | null = null
					if (firedAt !== undefined) {
						for (let i = activeEdges.length - 1; i >= 0; i--) {
							const e = activeEdges[i]
							if (e.sourceId === participant.id || e.targetId === participant.id) {
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
		</svg>
	)
}

// Re-export so the side panel can lookup labels without a separate import.
export { PARTICIPANT_BY_ID }
