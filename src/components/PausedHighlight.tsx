import { EVENT_COLOR } from "../lib/eventColor"
import type { PixelCoord, ReplayEvent } from "../lib/types"

interface Props {
	event: ReplayEvent
	from: PixelCoord
	to: PixelCoord
}

// Static frozen highlight rendered during paused mode. No framer-motion so it
// doesn't tween away — it stays put until the user changes focus.
export function PausedHighlight({ event, from, to }: Props) {
	const color = EVENT_COLOR[event.type]
	const midX = (from.x + to.x) / 2
	const midY = (from.y + to.y) / 2
	return (
		<g style={{ pointerEvents: "none" }}>
			<line
				x1={from.x}
				y1={from.y}
				x2={to.x}
				y2={to.y}
				stroke={color}
				strokeWidth={2}
				strokeOpacity={0.55}
				strokeLinecap="round"
				style={{ mixBlendMode: "screen" }}
			/>
			<circle
				cx={midX}
				cy={midY}
				r={5.5}
				fill={color}
				style={{ filter: `drop-shadow(0 0 11px ${color})` }}
			/>
		</g>
	)
}
