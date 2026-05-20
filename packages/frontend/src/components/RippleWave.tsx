import { motion } from "framer-motion"
import { BUCKET_COLOR } from "../lib/eventTypes"
import {
	RIPPLE_MAX_RADIUS,
	RIPPLE_VISUAL_DURATION_MS,
} from "../lib/replayClock"
import type { PixelCoord, ReplayEvent } from "../lib/types"

interface Props {
	event: ReplayEvent
	from: PixelCoord
}

// Expanding ring from the source. Visualises one bus broadcast — subscribers
// pulse independently as the ring's front-edge reaches them (the timing of
// those pulses is driven by useReplayDriver, not this component).
export function RippleWave({ event, from }: Props) {
	const color = BUCKET_COLOR[event.bucket]
	return (
		<motion.circle
			cx={from.x}
			cy={from.y}
			fill="none"
			stroke={color}
			strokeWidth={1.4}
			initial={{ r: 0, opacity: 0.55 }}
			animate={{ r: RIPPLE_MAX_RADIUS, opacity: 0 }}
			transition={{
				duration: RIPPLE_VISUAL_DURATION_MS / 1000,
				ease: "easeOut",
			}}
			style={{ mixBlendMode: "screen" }}
		/>
	)
}
