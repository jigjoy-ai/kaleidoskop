// Wire types shared by the kaleidoskop frontend and backend. Anything sent
// over the WebSocket stream from backend → frontend, or stored in the upload
// payload, lives here.

export type EventBucket =
	| "lifecycle"
	| "spawn"
	| "tool_call"
	| "reasoning"
	| "verdict"
	| "knowledge"
	| "replan"
	| "message"
	| "error"

// Domain event names match the BusEvent subclasses in baro and the LLM-item
// types from @mozaik-ai/core.
export type DomainEvent =
	| "agent_state"
	| "story_spawn_request"
	| "story_spawned"
	| "level_started"
	| "level_completed"
	| "level_compute_request"
	| "run_start_request"
	| "run_started"
	| "run_completed"
	| "function_call"
	| "function_call_output"
	| "reasoning"
	| "model_message"
	| "agent_result"
	| "story_result"
	| "critique"
	| "knowledge"
	| "replan"
	| "coordination"
	| "agent_targeted_message"
	| "agent_user_message"
	| "conductor_state"
	| "claude_system"
	| "claude_rate_limit"
	| "claude_stream_chunk"
	| "claude_unknown_event"
	| "codex_system"
	| "codex_turn_event"
	| "codex_item_event"
	| "finalize_started"
	| "pr_created"
	| "error"
	| "unknown"

export type ParticipantRole = "conductor" | "driver" | "observer" | "story"

export interface ParticipantInfo {
	id: string
	label: string
	role: ParticipantRole
}

export interface ReplayEvent {
	id: string
	at: number
	domain: DomainEvent
	bucket: EventBucket
	sourceId: string
	subscriberIds: readonly string[]
	payload: string
	/**
	 * Original item fields from the audit log line. Carries the typed
	 * shape of the underlying domain event so consumers can drive
	 * behaviour off real data (e.g. `agent_state` phase, `story_result`
	 * success) instead of relying on the human-readable payload string.
	 * Optional — events emitted by participants that don't carry
	 * structured fields (or sources we couldn't parse) leave this empty.
	 */
	data?: Record<string, unknown>
}

export interface FiringPulse {
	at: number
	bucket: EventBucket
}

export type AgentLifeState = "hidden" | "active" | "completed"

// Metadata about a stored replay — returned by the upload endpoint and by
// any /api/runs/:id lookup.
export interface RunMetadata {
	id: string
	createdAt: string
	durationMs: number
	participantCount: number
	storyCount: number
	eventCount: number
	source?: string
}

/**
 * State reconstruction at a specific point in the run. Emitted by the
 * backend after a seek so the frontend can restore "what was visible
 * at this moment" — which hexes are completed, what the inspector
 * sidebar showed — without having to silently re-play every event
 * from 0 to the seek point.
 */
export interface ReplayStateSnapshot {
	atMs: number
	eventCount: number
	agentState: Record<string, AgentLifeState>
	/** Up to N most recent events at the seek point, newest first. */
	recent: ReplayEvent[]
}

/** Replay-time scrub distance below which a seek stays silent (today's behavior). */
export const SEEK_BURST_THRESHOLD_MS = 3000

/** Hard cap on events carried in a seek_burst envelope to bound payload size. */
export const SEEK_BURST_EVENT_CAP = 200

/**
 * Sent in place of `snapshot` when the user scrubs by more than
 * SEEK_BURST_THRESHOLD_MS of replay time. The frontend plays `events`
 * through the normal emit pipeline at burst speed, then applies
 * `snapshot` as the authoritative destination state.
 *
 * Backward seeks: `events` is the chronologically-forward slice
 * between min(fromMs, toMs) and max(fromMs, toMs). We do NOT reverse
 * for backward seeks — there is no "un-emit" primitive and reversed
 * ripples read as confusing. The destination snapshot is still
 * authoritative, so visiting earlier replay time after the burst
 * lands on the correct lifecycle state (snapshot-last wins).
 */
export interface ReplaySeekBurst {
	fromMs: number
	toMs: number
	/** Chronological forward order; length <= SEEK_BURST_EVENT_CAP. */
	events: ReplayEvent[]
	/** True if the in-between window had more than the cap and was downsampled. */
	truncated: boolean
	/** Applied AFTER the burst finishes — authoritative destination state. */
	snapshot: ReplayStateSnapshot
}

// Top-level message envelope on the WebSocket stream backend → frontend.
export type StreamMessage =
	| { kind: "hello"; meta: RunMetadata; participants: ParticipantInfo[] }
	| { kind: "event"; event: ReplayEvent }
	| { kind: "snapshot"; snapshot: ReplayStateSnapshot }
	| { kind: "seek_burst"; burst: ReplaySeekBurst }
	| { kind: "done" }
	| { kind: "error"; message: string }

// Top-level message envelope frontend → backend over the same WebSocket
// (playback control).
export type StreamCommand =
	| { kind: "play" }
	| { kind: "pause" }
	| { kind: "seek"; toMs: number }
	| { kind: "set_speed"; speed: number }

/**
 * Per-domain subscriber roster. Sourced from baro's CORE.md +
 * OBSERVERS.md — every BusEvent / SemanticEvent type has a known set of
 * participants that subscribe to it (Knowledge → Conductor + Auditor;
 * FunctionCall → Librarian + Sentry + Auditor; etc.).
 *
 * Audit logs don't carry subscriber lists, so the backend parser uses
 * this matrix to enrich each event before streaming, and the frontend
 * fan-out animation renders rippled subscriber pulses driven from it.
 *
 * Subscriber IDs match the canonical participant ids used in the
 * 19-cell honeycomb (conductor / critic / surgeon / librarian / sentry
 * / auditor / finalizer / story-factory / operator). Story-instance
 * subscribers aren't represented here — they're per-message recipients
 * inside `agent_targeted_message` and resolved by the caller.
 */
export const SUBSCRIBERS: Record<DomainEvent, readonly string[]> = {
	agent_state: ["sentry", "auditor"],
	story_spawn_request: ["story-factory", "auditor"],
	story_spawned: ["auditor"],
	level_started: ["finalizer", "auditor"],
	level_completed: ["conductor", "auditor"],
	level_compute_request: ["conductor", "auditor"],
	run_start_request: ["conductor", "auditor"],
	run_started: ["finalizer", "auditor"],
	run_completed: ["finalizer", "conductor", "auditor"],
	function_call: ["librarian", "sentry", "auditor"],
	function_call_output: ["librarian", "auditor"],
	reasoning: ["auditor"],
	model_message: ["auditor"],
	agent_result: ["critic", "auditor"],
	story_result: ["surgeon", "conductor", "finalizer", "auditor"],
	critique: ["auditor"],
	knowledge: ["conductor", "auditor"],
	replan: ["conductor", "auditor"],
	coordination: ["auditor"],
	agent_targeted_message: ["auditor"],
	agent_user_message: ["auditor"],
	conductor_state: ["auditor"],
	claude_system: ["auditor"],
	claude_rate_limit: ["auditor"],
	claude_stream_chunk: ["auditor"],
	claude_unknown_event: ["auditor"],
	codex_system: ["auditor"],
	codex_turn_event: ["auditor"],
	codex_item_event: ["auditor"],
	finalize_started: ["auditor"],
	pr_created: ["auditor"],
	error: ["auditor"],
	unknown: ["auditor"],
}
