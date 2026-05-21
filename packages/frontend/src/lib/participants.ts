import type { DomainEvent, Participant } from "./types"
// Re-export the shared, canonical subscriber matrix so scripted-demo
// renderings stay 1:1 with whatever the backend live mode enriches.
export { SUBSCRIBERS } from "@kaleidoskop/shared"

// Honeycomb layout, concentric rings:
//   ring 0 — Conductor (centre, drives the DAG)
//   ring 1 — 6 observers (critic, surgeon, librarian, sentry, auditor, finalizer)
//   ring 2 — Operator at bottom-centre (idx 1), StoryFactory at top-centre (idx 7),
//            up to 10 stories at the remaining ring-2 slots
//   ring 3 — 18 story slots when a run has more than 10 stories
//   ring 4 — 24 more story slots, total cap 52 stories per run
//
// All non-story positions are fixed by ring + ringIndex; story slots are
// allocated in the order discovered, ring 2 first, then 3, then 4.

interface ParticipantDecl extends Participant {}

const RING_0: ParticipantDecl[] = [
	{ id: "conductor", label: "Conductor", role: "conductor", ring: 0, ringIndex: 0 },
]

const RING_1: ParticipantDecl[] = [
	{ id: "critic", label: "Critic", role: "observer", ring: 1, ringIndex: 0 },
	{ id: "surgeon", label: "Surgeon", role: "observer", ring: 1, ringIndex: 1 },
	{ id: "librarian", label: "Librarian", role: "observer", ring: 1, ringIndex: 2 },
	{ id: "sentry", label: "Sentry", role: "observer", ring: 1, ringIndex: 3 },
	{ id: "auditor", label: "Auditor", role: "observer", ring: 1, ringIndex: 4 },
	{ id: "finalizer", label: "Finalizer", role: "observer", ring: 1, ringIndex: 5 },
]

const RING_2_FIXED: ParticipantDecl[] = [
	{ id: "operator", label: "Operator", role: "driver", ring: 2, ringIndex: 1 },
	{ id: "story-factory", label: "StoryFactory", role: "driver", ring: 2, ringIndex: 7 },
]

// Free ring-2 slots reserved for stories — walks counter-clockwise from
// bottom-left, skipping 1 (Operator) and 7 (StoryFactory).
const RING_2_STORY_INDICES = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11] as const

// Ring 3 and 4 are pure story rings; all positions get filled in order.
const RING_3_STORY_INDICES = Array.from({ length: 18 }, (_, i) => i)
const RING_4_STORY_INDICES = Array.from({ length: 24 }, (_, i) => i)

/** Build a story participant declaration. */
function storySlot(
	storyNumber: number,
	ring: number,
	ringIndex: number,
): ParticipantDecl {
	const padded = String(storyNumber).padStart(2, "0")
	return {
		id: `story-${padded}`,
		label: `S${padded}`,
		role: "story",
		ring,
		ringIndex,
	}
}

/**
 * Generate the full participant list for a run with `storyCount` stories.
 * Stories fill ring 2 (10 slots) first, then ring 3 (18 slots), then ring
 * 4 (24 slots). Above 52 stories the overflow is dropped — current
 * audit-log universe maxes out around the high 30s.
 */
export function generateParticipants(storyCount: number): Participant[] {
	const list: ParticipantDecl[] = [...RING_0, ...RING_1, ...RING_2_FIXED]
	let n = 0
	const cap = (slotsTaken: number) => Math.min(storyCount - n, slotsTaken)
	const taken2 = cap(RING_2_STORY_INDICES.length)
	for (let i = 0; i < taken2; i++) {
		n++
		list.push(storySlot(n, 2, RING_2_STORY_INDICES[i]!))
	}
	const taken3 = cap(RING_3_STORY_INDICES.length)
	for (let i = 0; i < taken3; i++) {
		n++
		list.push(storySlot(n, 3, RING_3_STORY_INDICES[i]!))
	}
	const taken4 = cap(RING_4_STORY_INDICES.length)
	for (let i = 0; i < taken4; i++) {
		n++
		list.push(storySlot(n, 4, RING_4_STORY_INDICES[i]!))
	}
	return list
}

/** Scripted demo baseline: 19 cells, 10 stories. */
export const DEMO_PARTICIPANTS: Participant[] = generateParticipants(10)

/** Backwards-compat aliases. The store now owns the *current* participant set. */
export const PARTICIPANTS = DEMO_PARTICIPANTS
export const PARTICIPANT_BY_ID = new Map(DEMO_PARTICIPANTS.map((p) => [p.id, p]))
export const STORY_IDS: readonly string[] = DEMO_PARTICIPANTS.filter(
	(p) => p.role === "story",
).map((p) => p.id)
export const OBSERVER_IDS: readonly string[] = DEMO_PARTICIPANTS.filter(
	(p) => p.role === "observer",
).map((p) => p.id)
export const DRIVER_IDS: readonly string[] = DEMO_PARTICIPANTS.filter(
	(p) => p.role === "driver",
).map((p) => p.id)

export const EMITTERS: Record<DomainEvent, readonly string[]> = {
	agent_state: STORY_IDS,
	story_spawn_request: ["conductor"],
	story_spawned: ["story-factory"],
	level_started: ["conductor"],
	level_completed: ["conductor"],
	run_started: ["conductor"],
	run_completed: ["conductor"],
	function_call: [...STORY_IDS, "critic", "surgeon"],
	function_call_output: [...STORY_IDS, "critic", "surgeon"],
	reasoning: STORY_IDS,
	model_message: STORY_IDS,
	agent_result: STORY_IDS,
	story_result: STORY_IDS,
	critique: ["critic"],
	knowledge: ["librarian"],
	replan: ["surgeon"],
	coordination: ["sentry"],
	agent_targeted_message: ["operator", "conductor", "critic", "librarian"],
	agent_user_message: STORY_IDS,
	conductor_state: ["conductor"],
	claude_system: STORY_IDS,
	claude_rate_limit: STORY_IDS,
	claude_stream_chunk: STORY_IDS,
	claude_unknown_event: STORY_IDS,
	level_compute_request: ["conductor"],
	run_start_request: ["operator"],
	finalize_started: ["finalizer"],
	pr_created: ["finalizer"],
	error: [...STORY_IDS, "conductor"],
	unknown: ["conductor"],
}
