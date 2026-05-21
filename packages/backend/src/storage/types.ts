/**
 * Abstract store for replay audit-log uploads. Production uses
 * S3RunStorage; local dev uses FsRunStorage. The interface intentionally
 * stays minimal — `put`, `get`, `head` — so swapping backends doesn't
 * require touching the HTTP/WS layer.
 *
 * Each run is identified by an opaque id (`r_<random>`) and stored as a
 * single JSONL blob plus a tiny meta object the upload endpoint
 * serialises alongside (durationMs, eventCount, etc.). Meta lives next
 * to the content under a sibling key so a GET /api/runs/:id can return
 * metadata without re-parsing the whole log.
 */
export interface RunMeta {
	id: string
	createdAt: string
	durationMs: number
	participantCount: number
	storyCount: number
	eventCount: number
	sizeBytes: number
	uploadedAt: string
}

export interface RunStorage {
	/**
	 * Persist a fresh audit-log + meta pair. Implementations should make
	 * the two writes ordered (meta after content) so a partial failure
	 * leaves content but no meta — easier to GC than the inverse.
	 */
	put(id: string, content: string, meta: RunMeta): Promise<void>

	/** Fetch the raw JSONL content. Throws if missing. */
	get(id: string): Promise<string>

	/** Fetch just the meta record. Returns null if either content or meta is missing. */
	getMeta(id: string): Promise<RunMeta | null>

	/** True when both content and meta exist. */
	exists(id: string): Promise<boolean>
}
