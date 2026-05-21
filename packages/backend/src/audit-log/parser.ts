import { readFile } from "fs/promises"
import {
	SUBSCRIBERS,
	type ParticipantInfo,
	type ReplayEvent,
} from "@mozaik-replay/shared"

import { parseSource } from "./source-mapper.js"
import { mapItem, summariseItem } from "./item-mapper.js"

export interface ParsedRun {
	participants: ParticipantInfo[]
	events: ReplayEvent[]
	/** Wall-clock span of the run in milliseconds, end − start. */
	durationMs: number
	/** Earliest `ts` seen, ISO string. */
	startedAt: string
}

interface RawLine {
	ts: string
	source: string
	item: unknown
}

/**
 * Read an audit-log JSONL file from disk, parse every line into a typed
 * ReplayEvent, and return the resulting events plus the discovered
 * participant roster. Lines that don't parse, miss required fields, or
 * carry unknown source strings flagged as `unknown` are kept in the event
 * stream (we don't silently drop) but the participant list excludes the
 * pure-noise `unknown-…` sources so the viz doesn't render hex slots for
 * Claude-plugin metadata.
 */
export async function parseAuditLog(path: string): Promise<ParsedRun> {
	const raw = await readFile(path, "utf8")
	return parseAuditLogString(raw)
}

export function parseAuditLogString(raw: string): ParsedRun {
	const lines = raw.split("\n")
	const parsed: { line: RawLine; tsMs: number }[] = []

	for (const line of lines) {
		if (!line.trim()) continue
		let obj: unknown
		try {
			obj = JSON.parse(line)
		} catch {
			continue
		}
		if (!isRawLine(obj)) continue
		const tsMs = Date.parse(obj.ts)
		if (Number.isNaN(tsMs)) continue
		parsed.push({ line: obj, tsMs })
	}

	if (parsed.length === 0) {
		return { participants: [], events: [], durationMs: 0, startedAt: "" }
	}

	parsed.sort((a, b) => a.tsMs - b.tsMs)
	const startMs = parsed[0]!.tsMs
	const endMs = parsed[parsed.length - 1]!.tsMs

	const participantsById = new Map<
		string,
		{ info: ParticipantInfo; firstSeen: number }
	>()
	const events: ReplayEvent[] = []
	let idCounter = 0

	for (const { line, tsMs } of parsed) {
		const source = parseSource(line.source)
		const at = tsMs - startMs

		// Track the participant on first sighting. We keep the first label /
		// role we see — same participant shouldn't change role mid-run, and
		// if the audit log disagrees we trust the first occurrence.
		if (
			!participantsById.has(source.id) &&
			!source.id.startsWith("unknown-")
		) {
			participantsById.set(source.id, {
				info: { id: source.id, label: source.label, role: source.role },
				firstSeen: at,
			})
		}

		const mapped = mapItem(line.item)
		idCounter += 1

		// Reconstruct the subscriber roster from the static SUBSCRIBERS
		// matrix — audit logs don't carry per-event subscriber info. Drop
		// the source itself from the subscriber list if it shows up there
		// (Mozaik fan-out doesn't deliver an event to its own emitter via
		// the external channel).
		const baseSubs = SUBSCRIBERS[mapped.domain] ?? []
		const subscriberIds = baseSubs.filter((s) => s !== source.id)

		events.push({
			id: `e${idCounter}`,
			at,
			domain: mapped.domain,
			bucket: mapped.bucket,
			sourceId: source.id,
			subscriberIds,
			payload: summariseItem(mapped.domain, mapped.fields, source.label),
			data: mapped.fields,
		})
	}

	const participants = [...participantsById.values()]
		.sort((a, b) => a.firstSeen - b.firstSeen)
		.map((p) => p.info)

	return {
		participants,
		events,
		durationMs: endMs - startMs,
		startedAt: parsed[0]!.line.ts,
	}
}

function isRawLine(v: unknown): v is RawLine {
	return (
		typeof v === "object" &&
		v !== null &&
		typeof (v as { ts?: unknown }).ts === "string" &&
		typeof (v as { source?: unknown }).source === "string" &&
		"item" in v
	)
}
