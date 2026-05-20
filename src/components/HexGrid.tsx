import { useEffect, useMemo, useRef } from "react"
import { PARTICIPANTS } from "../lib/participants"
import { VIEWBOX, layoutFor } from "../lib/hexLayout"
import { EVENT_COLOR } from "../lib/eventColor"
import { useReplayClock } from "../lib/replayClock"
import { EdgeFlash } from "./EdgeFlash"
import { HexParticipant } from "./HexParticipant"
import { PausedHighlight } from "./PausedHighlight"
import type { PixelCoord } from "../lib/types"

export function HexGrid() {
	const firing = useReplayClock((s) => s.firing)
	const activeEdges = useReplayClock((s) => s.activeEdges)
	const agentState = useReplayClock((s) => s.agentState)
	const selectedAgentId = useReplayClock((s) => s.selectedAgentId)
	const pausedFocus = useReplayClock((s) => s.pausedFocus)
	const playing = useReplayClock((s) => s.playing)
	const zoom = useReplayClock((s) => s.zoom)
	const selectAgent = useReplayClock((s) => s.selectAgent)
	const zoomIn = useReplayClock((s) => s.zoomIn)
	const zoomOut = useReplayClock((s) => s.zoomOut)

	const wrapperRef = useRef<HTMLDivElement>(null)

	const positions = useMemo(() => {
		const map = new Map<string, PixelCoord>()
		for (const p of PARTICIPANTS) map.set(p.id, layoutFor(p))
		return map
	}, [])

	// Mouse wheel = zoom. Attach manually so we can preventDefault (passive
	// listeners can't).
	useEffect(() => {
		const el = wrapperRef.current
		if (!el) return
		const handler = (e: WheelEvent) => {
			e.preventDefault()
			if (e.deltaY < 0) zoomIn()
			else zoomOut()
		}
		el.addEventListener("wheel", handler, { passive: false })
		return () => el.removeEventListener("wheel", handler)
	}, [zoomIn, zoomOut])

	const frozenIds = new Set<string>()
	if (!playing && pausedFocus) {
		frozenIds.add(pausedFocus.sourceId)
		frozenIds.add(pausedFocus.targetId)
	}

	return (
		<div
			ref={wrapperRef}
			className="w-full h-full"
			style={{
				transform: `rotate(-4deg) scale(${zoom})`,
				transformOrigin: "center center",
				transition: "transform 0.18s ease-out",
			}}
			onClick={() => selectAgent(null)}
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
				</defs>

				<g>
					{PARTICIPANTS.map((participant) => {
						const pos = positions.get(participant.id)!
						const lifeState = agentState[participant.id] ?? "hidden"
						let firingColor: string | null = null

						// Frozen focus during pause overrides the time-based firing colour
						// and persists until focus changes.
						if (!playing && pausedFocus && frozenIds.has(participant.id)) {
							firingColor = EVENT_COLOR[pausedFocus.type]
						} else if (firing[participant.id] !== undefined) {
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

						const isSelected = selectedAgentId === participant.id
						const isDimmed =
							selectedAgentId !== null && !isSelected

						return (
							<HexParticipant
								key={participant.id}
								participant={participant}
								pos={pos}
								lifeState={lifeState}
								firingColor={firingColor}
								frozen={!playing && pausedFocus !== null}
								isSelected={isSelected}
								isDimmed={isDimmed}
								onClick={(id) =>
									selectAgent(selectedAgentId === id ? null : id)
								}
							/>
						)
					})}
				</g>

				{/* Live flashes (skipped during pause — they'd just animate to 0 and disappear). */}
				{playing && (
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
				)}

				{/* Frozen highlight (static, no motion). */}
				{!playing && pausedFocus && (
					<PausedHighlight
						event={pausedFocus}
						from={positions.get(pausedFocus.sourceId)!}
						to={positions.get(pausedFocus.targetId)!}
					/>
				)}
			</svg>
		</div>
	)
}
