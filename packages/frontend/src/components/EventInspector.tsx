import { BUCKET_COLOR, BUCKET_LABEL, DOMAIN_LABEL } from "../lib/eventTypes"
import { useReplayClock } from "../lib/replayClock"

export function EventInspector() {
	const recent = useReplayClock((s) => s.recent)
	const playing = useReplayClock((s) => s.playing)
	const pausedFocus = useReplayClock((s) => s.pausedFocus)
	const setPausedFocus = useReplayClock((s) => s.setPausedFocus)
	const participantById = useReplayClock((s) => s.participantById)

	const focusedId = pausedFocus?.id ?? null
	const canFocus = !playing

	return (
		<aside className="w-full md:w-80 shrink-0 max-h-44 md:max-h-none border-t md:border-t-0 md:border-l border-[var(--color-border)] bg-[var(--color-bg-elev)] flex flex-col">
			<header className="px-4 py-3 border-b border-[var(--color-border)] text-xs uppercase tracking-[0.2em] text-[var(--color-fg-muted)] flex items-center justify-between">
				<span>recent events</span>
				{canFocus && (
					<span className="text-[10px] tracking-wider text-[var(--color-accent)]">
						click to focus
					</span>
				)}
			</header>
			<div className="flex-1 overflow-y-auto">
				{recent.length === 0 && (
					<div className="px-4 py-6 text-xs text-[var(--color-fg-muted)] font-mono">
						waiting for first event…
					</div>
				)}
				{recent.map((e) => {
					const color = BUCKET_COLOR[e.bucket]
					const source =
						participantById.get(e.sourceId)?.label ?? e.sourceId
					const isFocused = focusedId === e.id
					const subCount = e.subscriberIds.length

					return (
						<button
							type="button"
							key={e.id}
							onClick={() => {
								if (canFocus) setPausedFocus(e)
							}}
							disabled={!canFocus}
							className={
								"w-full text-left block px-4 py-2.5 border-b border-[var(--color-border)] font-mono text-[11px] leading-snug transition-colors " +
								(isFocused
									? "bg-[var(--color-accent)]/10 border-l-2 border-l-[var(--color-accent)] pl-[14px]"
									: canFocus
										? "hover:bg-[#1a1a23] cursor-pointer"
										: "cursor-default")
							}
						>
							<div className="flex items-center gap-2 mb-1">
								<span
									className="inline-block size-2 rounded-full shrink-0"
									style={{
										background: color,
										boxShadow: `0 0 6px ${color}`,
									}}
								/>
								<span
									className="uppercase tracking-wider"
									style={{ color }}
								>
									{BUCKET_LABEL[e.bucket]}
								</span>
								<span className="text-[var(--color-fg-muted)] ml-auto">
									{e.id}
								</span>
							</div>
							<div className="text-[var(--color-fg-muted)]">
								<span className="text-[var(--color-fg)]">{source}</span>
								<span className="mx-1">↗</span>
								<span className="text-[var(--color-fg-muted)]">
									{subCount} subscriber{subCount === 1 ? "" : "s"}
								</span>
							</div>
							<div className="mt-1 text-[var(--color-fg-muted)] line-clamp-2">
								{e.payload}
							</div>
							<div className="mt-0.5 text-[10px] text-[var(--color-fg-muted)]/60">
								{DOMAIN_LABEL[e.domain]}
							</div>
						</button>
					)
				})}
			</div>
		</aside>
	)
}
