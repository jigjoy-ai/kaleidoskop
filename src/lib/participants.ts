import type { DomainEvent, Participant } from "./types"

// Long-lived participants on the Mozaik bus during a baro run. Mirrors the
// real participant set in baro/packages/baro-orchestrator/src/participants/.
// Architect, Planner, and Reader are NOT here — they run as one-shot Claude
// CLI invocations *before* the bus orchestration begins, producing the
// architecture spec and the story DAG that Conductor then consumes.
const DRIVERS: Participant[] = [
	{ id: "conductor", label: "Conductor", role: "conductor" },
	{ id: "story-factory", label: "StoryFactory", role: "driver" },
	{ id: "operator", label: "Operator", role: "driver" },
]

const OBSERVERS: Participant[] = [
	{ id: "critic", label: "Critic", role: "observer" },
	{ id: "surgeon", label: "Surgeon", role: "observer" },
	{ id: "librarian", label: "Librarian", role: "observer" },
	{ id: "sentry", label: "Sentry", role: "observer" },
	{ id: "auditor", label: "Auditor", role: "observer" },
	{ id: "finalizer", label: "Finalizer", role: "observer" },
]

const STORY_COUNT = 12
const STORY_AGENTS: Participant[] = Array.from(
	{ length: STORY_COUNT },
	(_, i) => ({
		id: `story-${String(i + 1).padStart(2, "0")}`,
		label: `S${String(i + 1).padStart(2, "0")}`,
		role: "story" as const,
	}),
)

export const PARTICIPANTS: Participant[] = [
	...DRIVERS,
	...OBSERVERS,
	...STORY_AGENTS,
]

export const PARTICIPANT_BY_ID = new Map(
	PARTICIPANTS.map((p) => [p.id, p]),
)

export const STORY_IDS: readonly string[] = STORY_AGENTS.map((p) => p.id)
export const OBSERVER_IDS: readonly string[] = OBSERVERS.map((p) => p.id)
export const DRIVER_IDS: readonly string[] = DRIVERS.map((p) => p.id)

// Per-event subscriber sets. Sourced from CORE.md / OBSERVERS.md / types.ts
// in baro/packages/baro-orchestrator/src/participants. "auditor" subscribes
// to literally everything (its job is to JSONL the run); we include it
// explicitly per event so the emit-site has the full subscriber list.
//
// For the dynamic-recipient events (agent_targeted_message), we pick a
// plausible story agent at emit time and append it to the list.
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
	// agent_targeted_message has a recipientId field; we splice in a story id
	// at emit time. Auditor always in.
	agent_targeted_message: ["auditor"],
	error: ["auditor"],
}

// Emitters per event type — used to assign roles in the scripted run.
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
	error: [...STORY_IDS, "conductor"],
}
