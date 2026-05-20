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

// Domain event names match the BusEvent subclasses in
// baro/packages/baro-orchestrator/src/types.ts plus the LLM-shape events
// inherited from @mozaik-ai/core (FunctionCallItem etc).
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
	| "error"

export type ParticipantRole = "conductor" | "driver" | "observer" | "story"

export interface Participant {
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
}

export interface PixelCoord {
	x: number
	y: number
}

// Firing entry — one per active pulse on a participant. Keyed by participant
// id in the store, this captures both the time and the colour bucket so the
// hex pulse renders in the right hue.
export interface FiringPulse {
	at: number
	bucket: EventBucket
}
