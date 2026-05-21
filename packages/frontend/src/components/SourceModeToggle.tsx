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
 *
 * On smoke-test the pill is non-dismissable — it auto-connects on
 * mount and stays live for the duration of the page visit. Letting
 * users disconnect from the featured demo would race with the auto-
 * connect effect (disconnect flips sourceMode → "demo" → auto-connect
 * fires → another socket; rapid clicks stack sockets and freeze the
 * UI). On uploaded runs (`/r/r_<id>`) the pill remains dismissable
 * because the user opted into that connect themselves.
 */
export function SourceModeToggle() {
	const params = useParams<{ id?: string }>()
	const runId = params.id ?? "smoke-test"
	const isFeatured = runId === "smoke-test"
	const wsUrl = backendWsForRun(runId)

	const sourceMode = useReplayClock((s) => s.sourceMode)
	const sourceError = useReplayClock((s) => s.sourceError)
	const setSourceMode = useReplayClock((s) => s.setSourceMode)
	const resetRun = useReplayClock((s) => s.resetRun)
	const handleRef = useRef<WsClientHandle | null>(null)
	// Re-entrancy guard. The auto-connect effect depends on
	// [runId, sourceMode], and connectToBackend synchronously flips
	// sourceMode → "connecting", which re-fires the effect before
	// handleRef.current has been assigned in this render cycle. Without
	// this flag, two effect runs back-to-back can each pass the
	// "handleRef.current is null" check and open two sockets.
	const connectingRef = useRef(false)

	// When the run finishes naturally (backend sends `done`) or the
	// socket closes / errors out, the wsClient flips sourceMode back to
	// "demo"/"error" but our local `handleRef` still points to the
	// closed handle. Clear it here so the next `connect` click can open
	// a fresh session.
	useEffect(() => {
		if (sourceMode === "demo" || sourceMode === "error") {
			handleRef.current = null
			connectingRef.current = false
		}
	}, [sourceMode])

	// If the URL run id changes while we're connected (user navigated to
	// a different /r/:id without manually disconnecting), drop the old
	// socket so a fresh click hits the new id.
	useEffect(() => {
		if (handleRef.current) {
			handleRef.current.close()
			handleRef.current = null
			connectingRef.current = false
			resetRun()
			setSourceMode("demo")
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [runId])

	const connect = () => {
		if (handleRef.current) return
		if (connectingRef.current) return
		if (sourceMode === "connecting" || sourceMode === "live") return
		connectingRef.current = true
		try {
			handleRef.current = connectToBackend(wsUrl)
		} finally {
			// Release the guard on the next microtask — wsClient has
			// already synchronously set sourceMode to "connecting" by
			// this point, so the auto-connect effect's
			// `sourceMode === "demo"` check will fail on the rerun and
			// the guard isn't strictly needed any more.
			queueMicrotask(() => {
				connectingRef.current = false
			})
		}
	}

	// Auto-connect the moment we land on the featured demo run. On `/`
	// the router redirects to `/r/smoke-test`; the visitor never had a
	// chance to click "connect" themselves, so triggering it here makes
	// the landing page show real backend output instead of an idle
	// honeycomb. Uploaded runs (`/r/r_<id>`) still require an explicit
	// click — uploaders read the meta banner first, decide when to play.
	useEffect(() => {
		if (
			isFeatured &&
			sourceMode === "demo" &&
			!handleRef.current &&
			!connectingRef.current
		) {
			connect()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [runId, sourceMode])

	const disconnect = () => {
		handleRef.current?.close()
		handleRef.current = null
		connectingRef.current = false
		resetRun()
		setSourceMode("demo")
	}

	if (sourceMode === "live" || sourceMode === "connecting") {
		const label = sourceMode === "live" ? "live" : "connecting…"
		if (isFeatured) {
			// Featured-demo: non-clickable status indicator. Same shape
			// as the dismissable pill so the header layout doesn't shift.
			return (
				<span
					className="inline-flex items-center gap-2 rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-accent)]/15 px-2.5 py-1 font-mono text-[11px] text-[var(--color-fg)] select-none"
					title="Featured demo · streaming live"
					aria-live="polite"
				>
					<span
						className="inline-block size-2 rounded-full bg-[var(--color-accent)] animate-pulse"
						aria-hidden="true"
					/>
					{label}
				</span>
			)
		}
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
				{isFeatured ? "demo" : runId.slice(0, 10)}
			</span>
		</button>
	)
}
