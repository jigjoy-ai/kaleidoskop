import type { Edge, Participant } from "./types"

export const PARTICIPANTS: Participant[] = [
	{ id: "architect", label: "Architect", ring: 0, ringIndex: 0 },

	{ id: "planner", label: "Planner", ring: 1, ringIndex: 0 },
	{ id: "conductor", label: "Conductor", ring: 1, ringIndex: 1 },
	{ id: "reader", label: "Reader", ring: 1, ringIndex: 2 },
	{ id: "critic", label: "Critic", ring: 1, ringIndex: 3 },
	{ id: "surgeon", label: "Surgeon", ring: 1, ringIndex: 4 },
	{ id: "finalizer", label: "Finalizer", ring: 1, ringIndex: 5 },

	...Array.from({ length: 12 }, (_, i) => ({
		id: `story-${String(i + 1).padStart(2, "0")}`,
		label: `S${String(i + 1).padStart(2, "0")}`,
		ring: 2 as const,
		ringIndex: i,
	})),
]

const RING_1_IDS = PARTICIPANTS.filter((p) => p.ring === 1).map((p) => p.id)
const RING_2_IDS = PARTICIPANTS.filter((p) => p.ring === 2).map((p) => p.id)

// Architect (center) connects to every ring-1 participant.
const HUB_EDGES: Edge[] = RING_1_IDS.map((id) => ({
	sourceId: "architect",
	targetId: id,
}))

// Each ring-1 participant owns two adjacent ring-2 story agents (12 / 6 = 2 each).
const OWNERSHIP_EDGES: Edge[] = RING_2_IDS.map((storyId, i) => ({
	sourceId: RING_1_IDS[Math.floor(i / 2)],
	targetId: storyId,
}))

export const EDGES: Edge[] = [...HUB_EDGES, ...OWNERSHIP_EDGES]

export const PARTICIPANT_BY_ID = new Map(PARTICIPANTS.map((p) => [p.id, p]))
