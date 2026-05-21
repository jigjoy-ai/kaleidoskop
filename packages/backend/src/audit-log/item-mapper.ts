import type { DomainEvent, EventBucket } from "@mozaik-replay/shared"

/**
 * Normalise an audit-log `item` blob into a `{ domain, bucket, fields }`
 * triple. Handles both audit-log shapes baro has written:
 *
 *   - **Legacy (baro < 0.41)**: `{ type: "knowledge", sourceAgentId: …, tags: [], … }`
 *     — fields are siblings of `type` (BusEvent.toJSON pattern).
 *
 *   - **Native (baro 0.41+)**: `{ type: "knowledge", data: { sourceAgentId, tags, … } }`
 *     — fields live under `data` (Mozaik 3.10 SemanticEvent default
 *     JSON shape: just `type` + `data`).
 *
 *   - **Mozaik LLM items** (any version): `{ type: "function_call", call_id, name, arguments }`
 *     — flat top-level fields that match each item class's `toJSON`.
 *     These never go through the SemanticEvent envelope.
 *
 * The discriminator between native-SemanticEvent and legacy-BusEvent is
 * the presence of a `data` field on the item alongside `type`. LLM items
 * are detected by their specific `type` strings (`function_call`,
 * `function_call_output`, `reasoning`, `message`) and treated as flat.
 */

const LLM_ITEM_TYPES = new Set([
	"function_call",
	"function_call_output",
	"reasoning",
	"message",
])

// Bucket assignments for every domain we know how to render. Anything
// not in this map ends up in the `lifecycle` bucket via the fallback —
// keeps unknown event types visible without breaking the legend.
const BUCKET_OF: Partial<Record<DomainEvent, EventBucket>> = {
	agent_state: "lifecycle",
	story_spawn_request: "spawn",
	story_spawned: "spawn",
	level_started: "lifecycle",
	level_completed: "lifecycle",
	level_compute_request: "lifecycle",
	run_start_request: "lifecycle",
	run_started: "lifecycle",
	run_completed: "lifecycle",
	function_call: "tool_call",
	function_call_output: "tool_call",
	reasoning: "reasoning",
	model_message: "reasoning",
	agent_result: "verdict",
	story_result: "verdict",
	critique: "verdict",
	knowledge: "knowledge",
	replan: "replan",
	coordination: "replan",
	agent_targeted_message: "message",
	agent_user_message: "message",
	conductor_state: "lifecycle",
	claude_system: "lifecycle",
	claude_rate_limit: "lifecycle",
	claude_stream_chunk: "reasoning",
	claude_unknown_event: "lifecycle",
	finalize_started: "lifecycle",
	pr_created: "lifecycle",
	error: "error",
	unknown: "lifecycle",
}

/**
 * Some baro legacy events use Claude-prefixed wire names but represent
 * the same semantic as a renamed Mozaik domain. Translate at the
 * mapping boundary so the rest of the pipeline sees the canonical name.
 *   - `claude_result` → `agent_result` (baro 0.34 renamed
 *     `ClaudeResultItem` → `AgentResultItem`; legacy logs keep the old
 *     wire string for backward compat)
 */
const LEGACY_DOMAIN_RENAME: Record<string, DomainEvent> = {
	claude_result: "agent_result",
}

export interface MappedItem {
	/** Canonical domain name. `unknown` if the audit log used a type we don't recognise. */
	domain: DomainEvent
	bucket: EventBucket
	/** Original wire shape exposed for payload-building helpers. */
	fields: Record<string, unknown>
	/** True if the source line used the new `{type, data}` SemanticEvent envelope. */
	isSemanticEvent: boolean
}

export function mapItem(item: unknown): MappedItem {
	if (!isRecord(item) || typeof item.type !== "string") {
		return {
			domain: "unknown",
			bucket: "lifecycle",
			fields: {},
			isSemanticEvent: false,
		}
	}

	const rawType = item.type
	const isLlmItem = LLM_ITEM_TYPES.has(rawType)
	const wrappedShape =
		!isLlmItem && "data" in item && isRecord((item as Record<string, unknown>).data)
	const flatFields = wrappedShape
		? ((item as Record<string, unknown>).data as Record<string, unknown>)
		: stripField(item, "type")

	// `message` in audit logs can be either a Mozaik ModelMessage (assistant
	// side) or a user-side input echoed from Claude CLI. Both come through
	// the same `type: "message"` discriminator on the wire; we infer the
	// flavour from the `role` field where present.
	let domain: DomainEvent = (LEGACY_DOMAIN_RENAME[rawType] ??
		(rawType as DomainEvent))
	if (rawType === "message") {
		const role = (item as { message?: { role?: string }; role?: string })
			.role ?? (item as { message?: { role?: string } }).message?.role
		domain = role === "assistant" ? "model_message" : "agent_targeted_message"
	}

	if (!(domain in BUCKET_OF)) {
		// Unknown domain string — preserve the raw type for the inspector
		// but bucket it as lifecycle so it still shows on screen.
		return {
			domain: "unknown",
			bucket: "lifecycle",
			fields: { ...flatFields, _unknownType: rawType },
			isSemanticEvent: wrappedShape,
		}
	}

	return {
		domain,
		bucket: BUCKET_OF[domain] ?? "lifecycle",
		fields: flatFields,
		isSemanticEvent: wrappedShape,
	}
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v)
}

function stripField(
	obj: Record<string, unknown>,
	key: string,
): Record<string, unknown> {
	const { [key]: _omit, ...rest } = obj
	void _omit
	return rest
}

/**
 * Produce a short, single-line human summary from a mapped item. Used by
 * the frontend inspector to render each event row without forcing the UI
 * to know every domain's payload shape.
 */
export function summariseItem(
	domain: DomainEvent,
	fields: Record<string, unknown>,
	sourceLabel: string,
): string {
	switch (domain) {
		case "agent_state": {
			const phase = strField(fields, "phase") ?? "?"
			const detail = strField(fields, "detail")
			return detail ? `${sourceLabel} → ${phase} (${detail})` : `${sourceLabel} → ${phase}`
		}
		case "conductor_state": {
			const phase = strField(fields, "phase") ?? "?"
			const detail = strField(fields, "detail")
			return detail ? `Conductor → ${phase} (${detail})` : `Conductor → ${phase}`
		}
		case "story_spawn_request": {
			const storyId = strField(fields, "storyId") ?? "?"
			return `Conductor → spawn ${storyId}`
		}
		case "story_spawned": {
			const storyId = strField(fields, "storyId") ?? "?"
			return `StoryFactory → ${storyId} joined`
		}
		case "level_started": {
			const ordinal = numField(fields, "ordinal") ?? "?"
			const storyIds = arrField(fields, "storyIds")
			return `Level ${ordinal} → [${storyIds.join(", ")}]`
		}
		case "level_completed": {
			const ordinal = numField(fields, "ordinal") ?? "?"
			const passed = arrField(fields, "passed").length
			const failed = arrField(fields, "failed").length
			return `Level ${ordinal} done — ${passed} passed, ${failed} failed`
		}
		case "run_started": {
			const project = strField(fields, "project") ?? "?"
			const count = numField(fields, "storyCount") ?? "?"
			return `RunStarted: ${project} (${count} stories)`
		}
		case "run_completed": {
			const success = fields.success === true ? "success" : "fail"
			return `RunCompleted — ${success}`
		}
		case "function_call": {
			const name = strField(fields, "name") ?? "?"
			return `${sourceLabel} → ${name}(…)`
		}
		case "function_call_output": {
			return `${sourceLabel} ← tool result`
		}
		case "reasoning":
			return `${sourceLabel} streaming reasoning`
		case "model_message":
			return `${sourceLabel} → assistant message`
		case "agent_result": {
			const isError = fields.isError === true
			return isError ? `${sourceLabel} → error` : `${sourceLabel} → result`
		}
		case "story_result": {
			const success = fields.success === true
			const storyId = strField(fields, "storyId") ?? "?"
			return `${storyId} → ${success ? "PASS" : "FAIL"}`
		}
		case "critique": {
			const verdict = strField(fields, "verdict") ?? strField(fields, "verdict") ?? "?"
			return `Critic → ${sourceLabel}: ${verdict}`
		}
		case "knowledge": {
			const summary = strField(fields, "summary")
			return summary ? `Librarian → ${summary}` : `Librarian → knowledge`
		}
		case "replan": {
			const reason = strField(fields, "reason") ?? "?"
			return `Surgeon → replan: ${reason}`
		}
		case "coordination": {
			const reason = strField(fields, "reason") ?? "?"
			return `Sentry → ${reason}`
		}
		case "agent_targeted_message": {
			const recipient =
				strField(fields, "recipientId") ?? strField(fields, "recipient") ?? "?"
			return `${sourceLabel} → ${recipient}`
		}
		case "claude_system": {
			const subtype = strField(fields, "subtype") ?? "?"
			return `${sourceLabel} → claude:${subtype}`
		}
		case "claude_rate_limit":
			return `${sourceLabel} → rate limit info`
		case "error": {
			const detail = strField(fields, "detail") ?? strField(fields, "message")
			return detail ? `${sourceLabel} → error: ${detail}` : `${sourceLabel} → error`
		}
		case "unknown": {
			const t = strField(fields, "_unknownType") ?? "?"
			return `${sourceLabel} → ${t}`
		}
		case "level_compute_request":
			return `Conductor → level compute request`
		case "run_start_request":
			return `${sourceLabel} → RunStartRequest`
		case "agent_user_message":
			return `${sourceLabel} → user message`
		case "claude_stream_chunk":
			return `${sourceLabel} → stream chunk`
		case "claude_unknown_event":
			return `${sourceLabel} → claude (unknown)`
		case "finalize_started":
			return `Finalizer → composing PR`
		case "pr_created":
			return `Finalizer → PR created`
	}
}

function strField(o: Record<string, unknown>, k: string): string | undefined {
	const v = o[k]
	return typeof v === "string" ? v : undefined
}
function numField(o: Record<string, unknown>, k: string): number | undefined {
	const v = o[k]
	return typeof v === "number" ? v : undefined
}
function arrField(o: Record<string, unknown>, k: string): readonly string[] {
	const v = o[k]
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}
