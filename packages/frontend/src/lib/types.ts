// All wire types live in the shared package. We re-export them so frontend
// imports stay short (`from "../lib/types"`) and we can layer in
// frontend-only types here.

export type {
	AgentLifeState,
	DomainEvent,
	EventBucket,
	FiringPulse,
	ParticipantRole,
	ReplayEvent,
	RunMetadata,
	StreamCommand,
	StreamMessage,
} from "@mozaik-replay/shared"
import type { ParticipantInfo } from "@mozaik-replay/shared"

// Frontend-only: layout adds ring/ringIndex to the wire ParticipantInfo.
export interface Participant extends ParticipantInfo {
	ring: 0 | 1 | 2
	ringIndex: number
}

export interface PixelCoord {
	x: number
	y: number
}
