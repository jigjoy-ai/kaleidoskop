import { motion } from "framer-motion"
import { HEX_SIZE, hexVertices } from "../lib/hexLayout"
import type { Participant, PixelCoord } from "../lib/types"

interface Props {
	participant: Participant
	pos: PixelCoord
	firingColor: string | null
}

const IDLE_STROKE = "#2c2c3a"
const IDLE_STROKE_CENTRE = "#3a3a4c"

export function HexParticipant({ participant, pos, firingColor }: Props) {
	const firing = firingColor !== null
	const idleStroke =
		participant.ring === 0 ? IDLE_STROKE_CENTRE : IDLE_STROKE

	let labelColor: string
	if (firing) labelColor = "#f6f6fb"
	else if (participant.ring === 0) labelColor = "#d6d6e0"
	else if (participant.ring === 1) labelColor = "#a4a4b4"
	else labelColor = "#7c7c8a"

	const fontSize =
		participant.ring === 0 ? 13 : participant.ring === 1 ? 12 : 11

	return (
		<g transform={`translate(${pos.x}, ${pos.y})`}>
			<motion.polygon
				points={hexVertices(0, 0, HEX_SIZE)}
				fill="url(#hex-fill)"
				initial={false}
				animate={{
					stroke: firing ? (firingColor as string) : idleStroke,
					strokeWidth: firing ? 2.4 : 1.2,
					filter: firing
						? `drop-shadow(0 0 10px ${firingColor})`
						: "drop-shadow(0 0 0 transparent)",
				}}
				transition={{ duration: 0.25, ease: "easeOut" }}
			/>
			{firing && (
				<motion.polygon
					points={hexVertices(0, 0, HEX_SIZE)}
					fill="none"
					stroke={firingColor as string}
					strokeWidth={1.8}
					strokeOpacity={0.7}
					initial={{ scale: 1, opacity: 0.7 }}
					animate={{ scale: 1.35, opacity: 0 }}
					transition={{ duration: 0.85, ease: "easeOut" }}
					style={{ transformOrigin: "0px 0px" }}
				/>
			)}
			<text
				textAnchor="middle"
				dy="0.36em"
				className="select-none pointer-events-none"
				fill={labelColor}
				fontSize={fontSize}
				fontFamily="ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace"
				fontWeight={participant.ring === 0 ? 600 : 500}
				style={{
					letterSpacing: participant.ring === 0 ? "0.02em" : 0,
				}}
			>
				{participant.label}
			</text>
		</g>
	)
}
