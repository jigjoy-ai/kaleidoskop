import type { Edge, Participant } from "./types"

// Ring 1 participants are listed in the order the hex-layout generator visits
// the ring (counter-clockwise starting bottom-left). The placement gives a
// readable clockwise workflow once you trace from Planner → Conductor → Reader
// → Surgeon → Critic → Finalizer around the centre.
const RING_1_LABELS = [
	{ id: "critic", label: "Critic" },
	{ id: "surgeon", label: "Surgeon" },
	{ id: "reader", label: "Reader" },
	{ id: "planner", label: "Planner" },
	{ id: "finalizer", label: "Finalizer" },
	{ id: "conductor", label: "Conductor" },
] as const

export const PARTICIPANTS: Participant[] = [
	{ id: "architect", label: "Architect", ring: 0, ringIndex: 0 },

	...RING_1_LABELS.map((p, i) => ({
		id: p.id,
		label: p.label,
		ring: 1 as const,
		ringIndex: i,
	})),

	...Array.from({ length: 12 }, (_, i) => ({
		id: `story-${String(i + 1).padStart(2, "0")}`,
		label: `S${String(i + 1).padStart(2, "0")}`,
		ring: 2 as const,
		ringIndex: i,
	})),
]

const RING_1_IDS = PARTICIPANTS.filter((p) => p.ring === 1).map((p) => p.id)
const RING_2_IDS = PARTICIPANTS.filter((p) => p.ring === 2).map((p) => p.id)

// Architect (centre) connects to every ring-1 participant.
const HUB_EDGES: Edge[] = RING_1_IDS.map((id) => ({
	sourceId: "architect",
	targetId: id,
}))

// Because ring 2 and ring 1 are both walked in the same direction with the
// same starting point, dividing by 2 cleanly pairs each ring-2 story agent
// with its physically-adjacent ring-1 owner.
const OWNERSHIP_EDGES: Edge[] = RING_2_IDS.map((storyId, i) => ({
	sourceId: RING_1_IDS[Math.floor(i / 2)],
	targetId: storyId,
}))

export const EDGES: Edge[] = [...HUB_EDGES, ...OWNERSHIP_EDGES]

export const PARTICIPANT_BY_ID = new Map(PARTICIPANTS.map((p) => [p.id, p]))
