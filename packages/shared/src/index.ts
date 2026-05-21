// Wire types shared by the mozaik-replay frontend and backend. Anything sent
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
	| "conductor_state"
	| "claude_system"
	| "claude_rate_limit"
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

// Top-level message envelope on the WebSocket stream backend → frontend.
export type StreamMessage =
	| { kind: "hello"; meta: RunMetadata; participants: ParticipantInfo[] }
	| { kind: "event"; event: ReplayEvent }
	| { kind: "done" }
	| { kind: "error"; message: string }

// Top-level message envelope frontend → backend over the same WebSocket
// (playback control).
export type StreamCommand =
	| { kind: "play" }
	| { kind: "pause" }
	| { kind: "seek"; toMs: number }
	| { kind: "set_speed"; speed: number }
