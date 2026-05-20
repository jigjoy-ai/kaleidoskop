import { BUCKETS, BUCKET_COLOR, BUCKET_LABEL } from "../lib/eventTypes"

export function EventLegend() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[11px] font-mono">
			<span className="uppercase tracking-[0.2em] text-[var(--color-fg-muted)] mr-1">
				events
			</span>
			{BUCKETS.map((b) => (
				<span
					key={b}
					className="inline-flex items-center gap-1.5 text-[var(--color-fg-muted)]"
				>
					<span
						className="inline-block size-2 rounded-full"
						style={{
							background: BUCKET_COLOR[b],
							boxShadow: `0 0 5px ${BUCKET_COLOR[b]}`,
						}}
					/>
					{BUCKET_LABEL[b]}
				</span>
			))}
		</div>
	)
}
