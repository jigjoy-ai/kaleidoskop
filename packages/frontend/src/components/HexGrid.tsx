import { useEffect, useMemo, useRef } from "react"
import { layoutFor } from "../lib/hexLayout"
import { BUCKET_COLOR } from "../lib/eventTypes"
import { useReplayClock } from "../lib/replayClock"
import { HexParticipant } from "./HexParticipant"
import { PausedHighlight } from "./PausedHighlight"
import { RippleWave } from "./RippleWave"
import type { PixelCoord } from "../lib/types"

export function HexGrid() {
	const firing = useReplayClock((s) => s.firing)
	const activeRipples = useReplayClock((s) => s.activeRipples)
	const agentState = useReplayClock((s) => s.agentState)
	const selectedAgentId = useReplayClock((s) => s.selectedAgentId)
	const pausedFocus = useReplayClock((s) => s.pausedFocus)
	const playing = useReplayClock((s) => s.playing)
	const zoom = useReplayClock((s) => s.zoom)
	const selectAgent = useReplayClock((s) => s.selectAgent)
	const zoomIn = useReplayClock((s) => s.zoomIn)
	const zoomOut = useReplayClock((s) => s.zoomOut)
	const participants = useReplayClock((s) => s.participants)
	const viewBox = useReplayClock((s) => s.viewBox)

	const wrapperRef = useRef<HTMLDivElement>(null)

	const positions = useMemo(() => {
		const map = new Map<string, PixelCoord>()
		for (const p of participants) map.set(p.id, layoutFor(p.ring, p.ringIndex))
		return map
	}, [participants])

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

	const frozenColors = new Map<string, string>()
	if (!playing && pausedFocus) {
		const color = BUCKET_COLOR[pausedFocus.bucket]
		frozenColors.set(pausedFocus.sourceId, color)
		for (const subId of pausedFocus.subscriberIds) {
			frozenColors.set(subId, color)
		}
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
				viewBox={viewBox}
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

				{playing && (
					<g>
						{activeRipples.map((event) => {
							const from = positions.get(event.sourceId)
							if (!from) return null
							return <RippleWave key={event.id} event={event} from={from} />
						})}
					</g>
				)}

				<g>
					{participants.map((participant) => {
						const pos = positions.get(participant.id)!
						const lifeState = agentState[participant.id] ?? "hidden"

						let firingColor: string | null = null
						const frozenC = frozenColors.get(participant.id)
						if (frozenC && !playing && pausedFocus) {
							firingColor = frozenC
						} else {
							const pulse = firing[participant.id]
							if (pulse !== undefined) {
								firingColor = BUCKET_COLOR[pulse.bucket]
							}
						}

						const isSelected = selectedAgentId === participant.id
						const isDimmed = selectedAgentId !== null && !isSelected

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

				{!playing && pausedFocus && (
					<PausedHighlight event={pausedFocus} positions={positions} />
				)}
			</svg>
		</div>
	)
}
