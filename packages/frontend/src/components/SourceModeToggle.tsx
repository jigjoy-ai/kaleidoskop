import { useRef } from "react"
import { useReplayClock } from "../lib/replayClock"
import { connectToBackend, type WsClientHandle } from "../lib/wsClient"

const DEFAULT_BACKEND_URL =
	(import.meta.env.VITE_REPLAY_BACKEND_URL as string | undefined) ??
	"ws://localhost:8787/api/runs/smoke-test/stream"

/**
 * Header pill that toggles between the local scripted demo and a live
 * backend connection. The backend currently always replays a hardcoded
 * sample audit log (`~/.baro/runs/baro-1778482053.jsonl`); the run id
 * in the URL is decorative until the upload pipeline lands.
 */
export function SourceModeToggle() {
	const sourceMode = useReplayClock((s) => s.sourceMode)
	const sourceError = useReplayClock((s) => s.sourceError)
	const setSourceMode = useReplayClock((s) => s.setSourceMode)
	const resetRun = useReplayClock((s) => s.resetRun)
	const handleRef = useRef<WsClientHandle | null>(null)

	const connect = () => {
		if (handleRef.current) return
		handleRef.current = connectToBackend(DEFAULT_BACKEND_URL)
	}

	const disconnect = () => {
		handleRef.current?.close()
		handleRef.current = null
		resetRun()
		setSourceMode("demo")
	}

	if (sourceMode === "live" || sourceMode === "connecting") {
		const label = sourceMode === "live" ? "live" : "connecting…"
		return (
			<button
				type="button"
				onClick={disconnect}
				className="inline-flex items-center gap-2 rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-accent)]/15 px-2.5 py-1 font-mono text-[11px] text-[var(--color-fg)] hover:bg-[var(--color-accent)]/25 transition-colors"
				title="Disconnect, return to scripted demo"
			>
				<span
					className="inline-block size-2 rounded-full bg-[var(--color-accent)] animate-pulse"
					aria-hidden="true"
				/>
				{label}
				<span aria-hidden="true">×</span>
			</button>
		)
	}

	return (
		<button
			type="button"
			onClick={connect}
			className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[#1a1a23] transition-colors"
			title={
				sourceError
					? `Last error: ${sourceError}. Click to retry.`
					: "Connect to local backend (replay sample audit log)"
			}
		>
			{sourceError ? "reconnect" : "connect"}
			<span
				className="text-[var(--color-fg-muted)]/70"
				aria-hidden="true"
			>
				ws://
			</span>
		</button>
	)
}
