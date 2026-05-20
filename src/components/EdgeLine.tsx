import type { PixelCoord } from "../lib/types"

interface Props {
	from: PixelCoord
	to: PixelCoord
}

export function EdgeLine({ from, to }: Props) {
	return (
		<line
			x1={from.x}
			y1={from.y}
			x2={to.x}
			y2={to.y}
			stroke="#1f1f28"
			strokeWidth={1}
			strokeLinecap="round"
		/>
	)
}
