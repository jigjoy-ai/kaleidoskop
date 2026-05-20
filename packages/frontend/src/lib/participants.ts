import type { DomainEvent, Participant } from "./types"

// 19-cell honeycomb: 1 + 6 + 12. The visual contract trumps strict role
// purity — StoryFactory and Operator are real long-lived bus participants
// but they share ring 2 with 10 story agents instead of getting their own
// inner ring. Ring 2 positions are walked counter-clockwise from bottom-left
// (ringIndex 0) so the algorithmic ordering and the hand-picked placements
// stay in sync.
//
// ring 0 — Conductor at the centre (drives the DAG)
// ring 1 — 6 observers
// ring 2 — Operator at bottom-centre, StoryFactory at top-centre,
//          10 story agents at the remaining 10 positions

interface ParticipantDecl extends Participant {}

const RING_0: ParticipantDecl[] = [
	{ id: "conductor", label: "Conductor", role: "conductor", ring: 0, ringIndex: 0 },
]

// Order matters: ringIndex walks counter-clockwise from bottom-left.
const RING_1: ParticipantDecl[] = [
	{ id: "critic", label: "Critic", role: "observer", ring: 1, ringIndex: 0 },
	{ id: "surgeon", label: "Surgeon", role: "observer", ring: 1, ringIndex: 1 },
	{ id: "librarian", label: "Librarian", role: "observer", ring: 1, ringIndex: 2 },
	{ id: "sentry", label: "Sentry", role: "observer", ring: 1, ringIndex: 3 },
	{ id: "auditor", label: "Auditor", role: "observer", ring: 1, ringIndex: 4 },
	{ id: "finalizer", label: "Finalizer", role: "observer", ring: 1, ringIndex: 5 },
]

// Ring 2 layout (counter-clockwise from bottom-left, 12 slots):
//   0  bottom-far-left   → story-01
//   1  bottom-centre     → Operator
//   2  bottom-far-right  → story-02
//   3  right-bottom      → story-03
//   4  far-right         → story-04
//   5  right-top         → story-05
//   6  top-far-right     → story-06
//   7  top-centre        → StoryFactory
//   8  top-far-left      → story-07
//   9  left-top          → story-08
//  10  far-left          → story-09
//  11  left-bottom       → story-10
const STORY_LABELS = [
	"S01",
	"S02",
	"S03",
	"S04",
	"S05",
	"S06",
	"S07",
	"S08",
	"S09",
	"S10",
] as const
const STORY_RING_INDICES = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11] as const

const RING_2: ParticipantDecl[] = [
	{
		id: "operator",
		label: "Operator",
		role: "driver",
		ring: 2,
		ringIndex: 1,
	},
	{
		id: "story-factory",
		label: "StoryFactory",
		role: "driver",
		ring: 2,
		ringIndex: 7,
	},
	...STORY_LABELS.map((label, i) => ({
		id: `story-${String(i + 1).padStart(2, "0")}`,
		label,
		role: "story" as const,
		ring: 2 as const,
		ringIndex: STORY_RING_INDICES[i],
	})),
]

export const PARTICIPANTS: Participant[] = [...RING_0, ...RING_1, ...RING_2]

export const PARTICIPANT_BY_ID = new Map(
	PARTICIPANTS.map((p) => [p.id, p]),
)

export const STORY_IDS: readonly string[] = PARTICIPANTS.filter(
	(p) => p.role === "story",
).map((p) => p.id)
export const OBSERVER_IDS: readonly string[] = PARTICIPANTS.filter(
	(p) => p.role === "observer",
).map((p) => p.id)
export const DRIVER_IDS: readonly string[] = PARTICIPANTS.filter(
	(p) => p.role === "driver",
).map((p) => p.id)

// Per-event subscriber sets. Sourced from CORE.md / OBSERVERS.md / types.ts
// in baro/packages/baro-orchestrator/src/participants. "auditor" subscribes
// to literally everything (its job is to JSONL the run).
//
// For dynamic-recipient events (agent_targeted_message), the scripted stream
// splices in a plausible story agent at emit time.
export const SUBSCRIBERS: Record<DomainEvent, readonly string[]> = {
	agent_state: ["sentry", "auditor"],
	story_spawn_request: ["story-factory", "auditor"],
	story_spawned: ["auditor"],
	level_started: ["finalizer", "auditor"],
	level_completed: ["conductor", "auditor"],
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
	conductor_state: ["auditor"],
	claude_system: ["auditor"],
	claude_rate_limit: ["auditor"],
	error: ["auditor"],
	unknown: ["auditor"],
}

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
	conductor_state: ["conductor"],
	claude_system: STORY_IDS,
	claude_rate_limit: STORY_IDS,
	error: [...STORY_IDS, "conductor"],
	unknown: ["conductor"],
}
