import { track } from "./analytics"
import { backendHttp } from "./backendUrls"

export interface UploadedRun {
	id: string
	meta: {
		id: string
		createdAt: string
		durationMs: number
		participantCount: number
		storyCount: number
		eventCount: number
		sizeBytes: number
		uploadedAt: string
	}
}

/**
 * POST an audit-log JSONL string to the backend's /api/runs endpoint.
 * Returns the generated run id + parsed meta.
 *
 * Throws on:
 *   - network failure (fetch reject)
 *   - non-2xx response (uses backend's `message` field as error text)
 *   - empty or unparseable JSONL (backend returns 400 with parse_failed)
 */
export async function uploadRun(content: string): Promise<UploadedRun> {
	track("run_upload_started", { sizeBytes: content.length })
	const res = await fetch(backendHttp("/api/runs"), {
		method: "POST",
		headers: { "Content-Type": "application/jsonl" },
		body: content,
	})
	if (!res.ok) {
		let detail = `HTTP ${res.status}`
		try {
			const body = (await res.json()) as { message?: string; error?: string }
			if (body.message) detail = body.message
			else if (body.error) detail = body.error
		} catch {
			/* response wasn't JSON — keep the status code message */
		}
		track("run_upload_failed", { status: res.status, detail })
		throw new Error(detail)
	}
	const result = (await res.json()) as UploadedRun
	track("run_upload_succeeded", {
		runId: result.id,
		eventCount: result.meta.eventCount,
		storyCount: result.meta.storyCount,
		durationMs: result.meta.durationMs,
		sizeBytes: result.meta.sizeBytes,
	})
	return result
}
