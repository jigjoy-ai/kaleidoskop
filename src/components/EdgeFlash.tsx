import { motion } from "framer-motion"
import { EVENT_COLOR } from "../lib/eventColor"
import type { PixelCoord, ReplayEvent } from "../lib/types"

interface Props {
	event: ReplayEvent
	from: PixelCoord
	to: PixelCoord
}

export function EdgeFlash({ event, from, to }: Props) {
	const color = EVENT_COLOR[event.type]
	return (
		<>
			<motion.line
				x1={from.x}
				y1={from.y}
				x2={to.x}
				y2={to.y}
				stroke={color}
				strokeWidth={1.6}
				strokeLinecap="round"
				initial={{ opacity: 0.55 }}
				animate={{ opacity: 0 }}
				transition={{ duration: 0.85, ease: "easeOut" }}
				style={{ mixBlendMode: "screen" }}
			/>
			<motion.circle
				r={5}
				fill={color}
				initial={{ cx: from.x, cy: from.y, opacity: 1 }}
				animate={{ cx: to.x, cy: to.y, opacity: 0 }}
				transition={{ duration: 0.65, ease: "easeOut" }}
				style={{ filter: `drop-shadow(0 0 9px ${color})` }}
			/>
		</>
	)
}
