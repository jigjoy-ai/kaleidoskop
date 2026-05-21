import { useReplayClock } from "../lib/replayClock"
import { PARTICIPANT_BY_ID } from "../lib/participants"

const SPEEDS = [0.5, 1, 2, 5] as const

function formatTime(ms: number, capMs: number): string {
	const totalSec = Math.min(capMs, ms) / 1000
	const m = Math.floor(totalSec / 60)
	const s = Math.floor(totalSec % 60)
	return `${m}:${s.toString().padStart(2, "0")}`
}

export function PlaybackControls() {
	const playing = useReplayClock((s) => s.playing)
	const speed = useReplayClock((s) => s.speed)
	const eventCount = useReplayClock((s) => s.eventCount)
	const simTimeMs = useReplayClock((s) => s.simTimeMs)
	const runDurationMs = useReplayClock((s) => s.runDurationMs)
	const selectedAgentId = useReplayClock((s) => s.selectedAgentId)
	const togglePlaying = useReplayClock((s) => s.togglePlaying)
	const setSpeed = useReplayClock((s) => s.setSpeed)
	const resetRun = useReplayClock((s) => s.resetRun)
	const selectAgent = useReplayClock((s) => s.selectAgent)
	const backendCommandSender = useReplayClock((s) => s.backendCommandSender)

	const progress =
		runDurationMs > 0
			? Math.min(100, (simTimeMs / runDurationMs) * 100)
			: 0
	const selectedLabel = selectedAgentId
		? PARTICIPANT_BY_ID.get(selectedAgentId)?.label
		: null

	// In live mode: round-trip play/pause/speed to the backend so the
	// ReplaySession halts/resumes its scheduler instead of just freezing
	// the on-screen animation. The local store update still fires for
	// progress-bar + button-state consistency.
	const handleTogglePlaying = () => {
		const nextPlaying = !playing
		togglePlaying()
		if (backendCommandSender) {
			backendCommandSender({ kind: nextPlaying ? "play" : "pause" })
		}
	}

	const handleSetSpeed = (s: number) => {
		setSpeed(s)
		if (backendCommandSender) {
			backendCommandSender({ kind: "set_speed", speed: s })
		}
	}

	return (
		<div className="border-t border-[var(--color-border)] bg-[var(--color-bg-elev)]">
			<div className="h-[3px] bg-[#1a1a23]">
				<div
					className="h-full bg-[var(--color-accent)] transition-all"
					style={{ width: `${progress}%`, transitionDuration: "120ms" }}
				/>
			</div>
			<div className="flex items-center gap-3 px-4 py-2.5 text-sm">
				<button
					type="button"
					onClick={handleTogglePlaying}
					className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs hover:bg-[#1a1a23] transition-colors"
				>
					<span aria-hidden="true">{playing ? "⏸" : "▶"}</span>
					{playing ? "pause" : "play"}
				</button>

				<div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5">
					{SPEEDS.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => handleSetSpeed(s)}
							className={
								"font-mono text-xs px-2 py-1 rounded transition-colors " +
								(speed === s
									? "bg-[var(--color-accent)] text-black"
									: "text-[var(--color-fg-muted)] hover:bg-[#1a1a23]")
							}
						>
							{s}×
						</button>
					))}
				</div>

				<button
					type="button"
					onClick={resetRun}
					className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-fg-muted)] hover:bg-[#1a1a23] transition-colors"
				>
					reset
				</button>

				{selectedLabel && (
					<button
						type="button"
						onClick={() => selectAgent(null)}
						className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-accent)]/10 px-2.5 py-1.5 font-mono text-xs text-[var(--color-fg)] hover:bg-[var(--color-accent)]/15 transition-colors"
						title="Click to clear focus"
					>
						focused: {selectedLabel}
						<span aria-hidden="true">×</span>
					</button>
				)}

				<div className="ml-auto flex items-center gap-4 font-mono text-xs text-[var(--color-fg-muted)]">
					<span>
						t:{" "}
						<span className="text-[var(--color-fg)]">
							{formatTime(simTimeMs, runDurationMs)}
						</span>
						<span className="text-[var(--color-fg-muted)]/60">
							{" / "}
							{formatTime(runDurationMs, runDurationMs)}
						</span>
					</span>
					<span>
						events:{" "}
						<span className="text-[var(--color-fg)]">{eventCount}</span>
					</span>
				</div>
			</div>
		</div>
	)
}
