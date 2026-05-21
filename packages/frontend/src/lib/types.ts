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
// Ring is open-ended (0…N) so we can grow the honeycomb beyond the
// scripted demo's 3-ring footprint when a real audit log has more stories
// than the default ring-2 budget (10 + 2 drivers).
export interface Participant extends ParticipantInfo {
	ring: number
	ringIndex: number
}

export interface PixelCoord {
	x: number
	y: number
}
