import { motion } from "framer-motion"
import { HEX_RADIUS, hexVertices } from "../lib/hexLayout"
import type { Participant, PixelCoord } from "../lib/types"

interface Props {
	participant: Participant
	pos: PixelCoord
	firingColor: string | null
}

export function HexParticipant({ participant, pos, firingColor }: Props) {
	const firing = firingColor !== null
	const ringRadius =
		participant.ring === 0 ? HEX_RADIUS * 1.05 : HEX_RADIUS * 0.78

	return (
		<g transform={`translate(${pos.x}, ${pos.y})`}>
			<motion.polygon
				points={hexVertices(0, 0, ringRadius)}
				fill="#12121a"
				stroke={firing ? (firingColor as string) : "#2a2a36"}
				strokeWidth={firing ? 2.5 : 1.2}
				animate={{
					stroke: firing ? (firingColor as string) : "#2a2a36",
					strokeWidth: firing ? 2.5 : 1.2,
					filter: firing
						? `drop-shadow(0 0 8px ${firingColor})`
						: "drop-shadow(0 0 0 transparent)",
				}}
				transition={{ duration: 0.25, ease: "easeOut" }}
			/>
			{firing && (
				<motion.polygon
					points={hexVertices(0, 0, ringRadius)}
					fill="none"
					stroke={firingColor as string}
					strokeWidth={2}
					initial={{ scale: 1, opacity: 0.6 }}
					animate={{ scale: 1.45, opacity: 0 }}
					transition={{ duration: 0.7, ease: "easeOut" }}
					style={{ transformOrigin: "0px 0px" }}
				/>
			)}
			<text
				textAnchor="middle"
				dy="0.35em"
				className="select-none pointer-events-none"
				fill={firing ? "#f5f5f8" : "#a8a8b8"}
				fontSize={participant.ring === 2 ? 11 : 12}
				fontFamily="ui-monospace, Menlo, Consolas, monospace"
				fontWeight={participant.ring === 0 ? 600 : 500}
			>
				{participant.label}
			</text>
		</g>
	)
}
