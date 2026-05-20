import { EVENT_COLOR, EVENT_LABEL, EVENT_TYPES } from "../lib/eventColor"

export function EventLegend() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[11px] font-mono">
			<span className="uppercase tracking-[0.2em] text-[var(--color-fg-muted)] mr-1">
				events
			</span>
			{EVENT_TYPES.map((t) => (
				<span
					key={t}
					className="inline-flex items-center gap-1.5 text-[var(--color-fg-muted)]"
				>
					<span
						className="inline-block size-2 rounded-full"
						style={{
							background: EVENT_COLOR[t],
							boxShadow: `0 0 5px ${EVENT_COLOR[t]}`,
						}}
					/>
					{EVENT_LABEL[t]}
				</span>
			))}
		</div>
	)
}
