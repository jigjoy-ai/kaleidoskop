import { useReplayClock } from "../lib/replayClock"

const SPEEDS = [0.5, 1, 2, 5] as const

export function PlaybackControls() {
	const playing = useReplayClock((s) => s.playing)
	const speed = useReplayClock((s) => s.speed)
	const eventCount = useReplayClock((s) => s.eventCount)
	const togglePlaying = useReplayClock((s) => s.togglePlaying)
	const setSpeed = useReplayClock((s) => s.setSpeed)
	const reset = useReplayClock((s) => s.reset)

	return (
		<div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] text-sm">
			<button
				type="button"
				onClick={togglePlaying}
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
						onClick={() => setSpeed(s)}
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
				onClick={reset}
				className="ml-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-fg-muted)] hover:bg-[#1a1a23] transition-colors"
			>
				reset
			</button>

			<div className="ml-auto font-mono text-xs text-[var(--color-fg-muted)]">
				events:{" "}
				<span className="text-[var(--color-fg)]">{eventCount}</span>
			</div>
		</div>
	)
}
