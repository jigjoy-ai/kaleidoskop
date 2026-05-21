import { useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import { backendWsForRun } from "../lib/backendUrls"
import { useReplayClock } from "../lib/replayClock"
import { connectToBackend, type WsClientHandle } from "../lib/wsClient"

/**
 * Header pill that toggles between the local scripted demo and a live
 * backend connection. The target run id comes from the URL path
 * (`/r/:id`); on `/` we default to the magic `smoke-test` id which the
 * backend resolves to its hardcoded sample log.
 */
export function SourceModeToggle() {
	const params = useParams<{ id?: string }>()
	const runId = params.id ?? "smoke-test"
	const wsUrl = backendWsForRun(runId)

	const sourceMode = useReplayClock((s) => s.sourceMode)
	const sourceError = useReplayClock((s) => s.sourceError)
	const setSourceMode = useReplayClock((s) => s.setSourceMode)
	const resetRun = useReplayClock((s) => s.resetRun)
	const handleRef = useRef<WsClientHandle | null>(null)

	// When the run finishes naturally (backend sends `done`) or the
	// socket closes / errors out, the wsClient flips sourceMode back to
	// "demo"/"error" but our local `handleRef` still points to the
	// closed handle. Clear it here so the next `connect` click can open
	// a fresh session.
	useEffect(() => {
		if (sourceMode === "demo" || sourceMode === "error") {
			handleRef.current = null
		}
	}, [sourceMode])

	// If the URL run id changes while we're connected (user navigated to
	// a different /r/:id without manually disconnecting), drop the old
	// socket so a fresh click hits the new id.
	useEffect(() => {
		if (handleRef.current) {
			handleRef.current.close()
			handleRef.current = null
			resetRun()
			setSourceMode("demo")
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [runId])

	const connect = () => {
		if (handleRef.current) return
		handleRef.current = connectToBackend(wsUrl)
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
				title={`Disconnect (was streaming ${runId})`}
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
					: `Connect to backend (replay ${runId})`
			}
		>
			{sourceError ? "reconnect" : "connect"}
			<span
				className="text-[var(--color-fg-muted)]/70"
				aria-hidden="true"
			>
				{runId === "smoke-test" ? "demo" : runId.slice(0, 10)}
			</span>
		</button>
	)
}
