import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { backendHttp } from "../lib/backendUrls"

interface RunMeta {
	id: string
	createdAt: string
	durationMs: number
	participantCount: number
	storyCount: number
	eventCount: number
	sizeBytes?: number
	uploadedAt?: string
}

function formatDuration(ms: number): string {
	const totalSec = Math.round(ms / 1000)
	const m = Math.floor(totalSec / 60)
	const s = totalSec % 60
	return `${m}:${s.toString().padStart(2, "0")}`
}

function formatDate(iso: string): string {
	if (!iso) return ""
	return iso.slice(0, 10)
}

/**
 * Thin info strip rendered between the legend and the hex grid when a
 * specific run is selected via `/r/:id`. Fetches meta from
 * `GET /api/runs/:id` once on mount and shows event/story counts +
 * duration + capture date. Hidden on `/` (no run id) and while the
 * fetch is in flight.
 */
export function RunMetaBanner() {
	const params = useParams<{ id?: string }>()
	const runId = params.id
	const [meta, setMeta] = useState<RunMeta | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!runId) {
			setMeta(null)
			setError(null)
			return
		}
		let cancelled = false
		setMeta(null)
		setError(null)
		fetch(backendHttp(`/api/runs/${runId}`))
			.then(async (r) => {
				if (cancelled) return
				if (!r.ok) {
					const body = (await r.json().catch(() => ({}))) as {
						message?: string
					}
					setError(body.message ?? `HTTP ${r.status}`)
					return
				}
				const data = (await r.json()) as RunMeta
				if (!cancelled) setMeta(data)
			})
			.catch((err: unknown) => {
				if (!cancelled) setError((err as Error).message)
			})
		return () => {
			cancelled = true
		}
	}, [runId])

	if (!runId) return null

	return (
		<div className="border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/40 px-5 py-2 text-[11px] font-mono">
			{error ? (
				<span className="text-red-400">
					meta fetch failed: {error}
				</span>
			) : !meta ? (
				<span className="text-[var(--color-fg-muted)]/70">
					loading run metadata…
				</span>
			) : (
				<div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-[var(--color-fg-muted)]">
					<span>
						<span className="text-[var(--color-fg-muted)]/60">run:</span>{" "}
						<span className="text-[var(--color-fg)]">{meta.id}</span>
					</span>
					<span>
						<span className="text-[var(--color-fg)]">{meta.eventCount}</span>{" "}
						events
					</span>
					<span>
						<span className="text-[var(--color-fg)]">{meta.storyCount}</span>{" "}
						stories
					</span>
					<span>
						<span className="text-[var(--color-fg)]">
							{meta.participantCount}
						</span>{" "}
						participants
					</span>
					<span>
						<span className="text-[var(--color-fg)]">
							{formatDuration(meta.durationMs)}
						</span>{" "}
						duration
					</span>
					<span>
						captured{" "}
						<span className="text-[var(--color-fg)]">
							{formatDate(meta.createdAt)}
						</span>
					</span>
				</div>
			)}
		</div>
	)
}
