export default function App() {
	return (
		<main className="min-h-full flex flex-col items-center justify-center px-6 text-center">
			<div className="mb-6 text-xs uppercase tracking-[0.3em] text-[var(--color-fg-muted)]">
				jigjoy-ai · mozaik-replay
			</div>
			<h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
				replay your agent runs
			</h1>
			<p className="mt-5 max-w-xl text-[var(--color-fg-muted)] text-lg">
				Drop in a Mozaik audit log. Watch every tool call, every bus event, every
				participant fire as a hexagonal neural network.
			</p>
			<div className="mt-10 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-2 font-mono text-sm text-[var(--color-fg-muted)]">
				<span className="inline-block size-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
				Phase 1 · hex grid + replay engine — in progress
			</div>
		</main>
	)
}
