import { motion } from "framer-motion"
import { hexVertices } from "../lib/hexLayout"
import { HEX_SIZE } from "../lib/forceLayout"
import type { AgentLifeState } from "../lib/replayClock"
import type { Participant, PixelCoord } from "../lib/types"

interface Props {
	participant: Participant
	pos: PixelCoord
	lifeState: AgentLifeState
	firingColor: string | null
	frozen: boolean
	isSelected: boolean
	isDimmed: boolean
	onClick: (id: string) => void
}

const STROKE_IDLE = "#2c2c3a"
const STROKE_IDLE_HUB = "#3a3a4c"
const STROKE_HIDDEN = "#1a1a23"
const STROKE_COMPLETED = "#3e7a4c"

function idleStrokeFor(
	participant: Participant,
	lifeState: AgentLifeState,
): string {
	if (lifeState === "hidden") return STROKE_HIDDEN
	if (lifeState === "completed") return STROKE_COMPLETED
	return participant.role === "conductor" ? STROKE_IDLE_HUB : STROKE_IDLE
}

function labelColorFor(
	participant: Participant,
	lifeState: AgentLifeState,
	firing: boolean,
	isSelected: boolean,
): string {
	if (firing || isSelected) return "#f6f6fb"
	if (lifeState === "hidden") return "#3a3a45"
	if (lifeState === "completed") return "#7fae8c"
	if (participant.role === "conductor") return "#d6d6e0"
	if (participant.role === "observer" || participant.role === "driver")
		return "#a4a4b4"
	return "#7c7c8a"
}

export function HexParticipant({
	participant,
	pos,
	lifeState,
	firingColor,
	frozen,
	isSelected,
	isDimmed,
	onClick,
}: Props) {
	const firing = firingColor !== null && lifeState === "active"
	const idleStroke = idleStrokeFor(participant, lifeState)
	const strokeColor = firing ? (firingColor as string) : idleStroke
	const strokeWidth = firing ? 2.2 : lifeState === "completed" ? 1.5 : 1.1

	let opacity = 1
	if (lifeState === "hidden") opacity = 0.14
	if (isDimmed) opacity = lifeState === "hidden" ? 0.06 : 0.28

	const labelColor = labelColorFor(
		participant,
		lifeState,
		firing,
		isSelected,
	)
	const fontSize =
		participant.role === "conductor"
			? 12
			: participant.role === "observer" || participant.role === "driver"
				? 11
				: 10
	const interactive = lifeState !== "hidden"

	return (
		<motion.g
			transform={`translate(${pos.x}, ${pos.y})`}
			animate={{ opacity }}
			transition={{ duration: 0.35, ease: "easeOut" }}
			onClick={(e) => {
				if (!interactive) return
				e.stopPropagation()
				onClick(participant.id)
			}}
			style={{ cursor: interactive ? "pointer" : "default" }}
		>
			<motion.polygon
				points={hexVertices(0, 0, HEX_SIZE)}
				fill="url(#hex-fill)"
				initial={false}
				animate={{
					stroke: strokeColor,
					strokeWidth,
					filter: firing
						? `drop-shadow(0 0 9px ${firingColor})`
						: isSelected
							? `drop-shadow(0 0 7px ${STROKE_IDLE_HUB})`
							: "drop-shadow(0 0 0 transparent)",
				}}
				transition={{ duration: frozen ? 0 : 0.22, ease: "easeOut" }}
			/>
			{firing && !frozen && (
				<motion.polygon
					points={hexVertices(0, 0, HEX_SIZE)}
					fill="none"
					stroke={firingColor as string}
					strokeWidth={1.6}
					strokeOpacity={0.7}
					initial={{ scale: 1, opacity: 0.7 }}
					animate={{ scale: 1.36, opacity: 0 }}
					transition={{ duration: 0.7, ease: "easeOut" }}
					style={{ transformOrigin: "0px 0px" }}
				/>
			)}
			{lifeState !== "hidden" && (
				<text
					textAnchor="middle"
					dy="0.36em"
					className="select-none pointer-events-none"
					fill={labelColor}
					fontSize={fontSize}
					fontFamily="ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace"
					fontWeight={participant.role === "conductor" ? 600 : 500}
					style={{
						letterSpacing: participant.role === "conductor" ? "0.02em" : 0,
					}}
				>
					{participant.label}
				</text>
			)}
		</motion.g>
	)
}
