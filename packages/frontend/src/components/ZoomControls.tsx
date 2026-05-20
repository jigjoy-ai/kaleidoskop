import { useReplayClock, ZOOM_MAX, ZOOM_MIN } from "../lib/replayClock"

export function ZoomControls() {
	const zoom = useReplayClock((s) => s.zoom)
	const zoomIn = useReplayClock((s) => s.zoomIn)
	const zoomOut = useReplayClock((s) => s.zoomOut)
	const resetZoom = useReplayClock((s) => s.resetZoom)

	const canZoomIn = zoom < ZOOM_MAX - 0.001
	const canZoomOut = zoom > ZOOM_MIN + 0.001

	return (
		<div
			className="absolute bottom-4 right-4 flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)]/95 backdrop-blur-sm p-1 font-mono text-xs shadow-lg"
			onClick={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				onClick={zoomOut}
				disabled={!canZoomOut}
				className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-[#1a1a23] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
				aria-label="Zoom out"
			>
				−
			</button>
			<button
				type="button"
				onClick={resetZoom}
				className="px-2 h-7 min-w-[3rem] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[#1a1a23] rounded transition-colors"
				aria-label="Reset zoom"
			>
				{zoom.toFixed(2)}×
			</button>
			<button
				type="button"
				onClick={zoomIn}
				disabled={!canZoomIn}
				className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-[#1a1a23] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
				aria-label="Zoom in"
			>
				+
			</button>
		</div>
	)
}
