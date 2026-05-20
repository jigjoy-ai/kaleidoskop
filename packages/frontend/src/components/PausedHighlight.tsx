import { BUCKET_COLOR } from "../lib/eventTypes"
import type { PixelCoord, ReplayEvent } from "../lib/types"

interface Props {
	event: ReplayEvent
	positions: Map<string, PixelCoord>
}

// Frozen visualisation of a bus broadcast. Static (no framer-motion). Drawn
// when the user pauses or scrubs to an event — source hex glows, every
// subscriber hex glows, and faint lines fan out from source to subscribers so
// the broadcast shape is legible at rest.
export function PausedHighlight({ event, positions }: Props) {
	const color = BUCKET_COLOR[event.bucket]
	const from = positions.get(event.sourceId)
	if (!from) return null

	return (
		<g style={{ pointerEvents: "none" }}>
			{event.subscriberIds.map((subId) => {
				const to = positions.get(subId)
				if (!to) return null
				return (
					<line
						key={`paused-line-${subId}`}
						x1={from.x}
						y1={from.y}
						x2={to.x}
						y2={to.y}
						stroke={color}
						strokeWidth={1.4}
						strokeOpacity={0.4}
						strokeLinecap="round"
						style={{ mixBlendMode: "screen" }}
					/>
				)
			})}
			<circle
				cx={from.x}
				cy={from.y}
				r={6}
				fill={color}
				style={{ filter: `drop-shadow(0 0 11px ${color})` }}
			/>
		</g>
	)
}
