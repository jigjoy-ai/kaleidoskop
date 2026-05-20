import { useEffect } from "react"
import { EventInspector } from "./components/EventInspector"
import { EventLegend } from "./components/EventLegend"
import { HexGrid } from "./components/HexGrid"
import { PlaybackControls } from "./components/PlaybackControls"
import { ZoomControls } from "./components/ZoomControls"
import { useReplayDriver } from "./lib/useReplayDriver"
import { useReplayClock } from "./lib/replayClock"

export default function App() {
	useReplayDriver()
	const selectAgent = useReplayClock((s) => s.selectAgent)

	// ESC clears focus, Space toggles play/pause.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") selectAgent(null)
			else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
				e.preventDefault()
				useReplayClock.getState().togglePlaying()
			}
		}
		window.addEventListener("keydown", handler)
		return () => window.removeEventListener("keydown", handler)
	}, [selectAgent])

	return (
		<div className="h-full flex flex-col">
			<header className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]">
				<div className="flex items-baseline gap-3">
					<span className="font-mono text-sm font-semibold tracking-tight">
						mozaik-replay
					</span>
					<span className="text-[11px] uppercase tracking-[0.25em] text-[var(--color-fg-muted)]">
						phase 1 prototype · scripted demo run
					</span>
				</div>
				<a
					href="https://github.com/jigjoy-ai/mozaik-replay"
					target="_blank"
					rel="noreferrer"
					className="text-xs font-mono text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
				>
					github ↗
				</a>
			</header>

			<EventLegend />

			<div className="flex-1 flex min-h-0">
				<main className="relative flex-1 flex items-center justify-center min-w-0 p-6 overflow-hidden">
					<div className="w-full h-full max-w-[760px] aspect-square">
						<HexGrid />
					</div>
					<ZoomControls />
				</main>
				<EventInspector />
			</div>

			<PlaybackControls />
		</div>
	)
}
