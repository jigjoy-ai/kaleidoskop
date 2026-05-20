import { EVENT_COLOR, EVENT_LABEL } from "../lib/eventColor"
import { PARTICIPANT_BY_ID } from "../lib/participants"
import { useReplayClock } from "../lib/replayClock"

export function EventInspector() {
	const recent = useReplayClock((s) => s.recent)

	return (
		<aside className="w-80 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-bg-elev)] flex flex-col">
			<header className="px-4 py-3 border-b border-[var(--color-border)] text-xs uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
				recent events
			</header>
			<div className="flex-1 overflow-y-auto">
				{recent.length === 0 && (
					<div className="px-4 py-6 text-xs text-[var(--color-fg-muted)] font-mono">
						waiting for first event…
					</div>
				)}
				{recent.map((e) => {
					const color = EVENT_COLOR[e.type]
					const source = PARTICIPANT_BY_ID.get(e.sourceId)?.label ?? e.sourceId
					const target = PARTICIPANT_BY_ID.get(e.targetId)?.label ?? e.targetId
					return (
						<div
							key={e.id}
							className="px-4 py-2.5 border-b border-[var(--color-border)] font-mono text-[11px] leading-snug"
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
									{EVENT_LABEL[e.type]}
								</span>
								<span className="text-[var(--color-fg-muted)] ml-auto">
									{e.id}
								</span>
							</div>
							<div className="text-[var(--color-fg-muted)]">
								<span className="text-[var(--color-fg)]">{source}</span>
								<span className="mx-1">→</span>
								<span className="text-[var(--color-fg)]">{target}</span>
							</div>
							<div className="mt-1 text-[var(--color-fg-muted)] line-clamp-2">
								{e.payload}
							</div>
						</div>
					)
				})}
			</div>
		</aside>
	)
}
