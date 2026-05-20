// Scripted timeline of a fictional baro run, mapped onto the real bus
// participant set. Architect/Planner are not here — they run as one-shot
// Claude invocations before Conductor takes over the bus, so they don't
// appear in the replay.
//
// Phase shape:
//   t=0       Conductor online
//   t=0.5s    Operator + StoryFactory online
//   t=1.5s    Auditor, Librarian, Sentry attach
//   t=3-4s    Critic, Surgeon attach
//   t=5s      Finalizer attaches; first level starts shortly
//   t=6-7s    Wave 1: stories 1-4 spawn
//   t=12-13s  Wave 2: stories 5-7 spawn (only 10 stories total)
//   t=18-19s  Wave 3: stories 8-10 spawn
//   t=34s     Last story completes
//   t=36s     Run completes; Finalizer composes the PR
//   t=42s     Conductor wraps up

export interface AgentScript {
	id: string
	spawnAt: number
	completeAt: number
	parentId?: string
}

export const RUN_SCRIPT: AgentScript[] = [
	{ id: "conductor", spawnAt: 0, completeAt: 42000 },
	{ id: "operator", spawnAt: 400, completeAt: 42000, parentId: "conductor" },
	{ id: "story-factory", spawnAt: 700, completeAt: 41500, parentId: "conductor" },

	{ id: "auditor", spawnAt: 1500, completeAt: 42000, parentId: "conductor" },
	{ id: "librarian", spawnAt: 2000, completeAt: 41000, parentId: "conductor" },
	{ id: "sentry", spawnAt: 2400, completeAt: 41000, parentId: "conductor" },

	{ id: "critic", spawnAt: 3500, completeAt: 40000, parentId: "conductor" },
	{ id: "surgeon", spawnAt: 4100, completeAt: 40000, parentId: "conductor" },
	{ id: "finalizer", spawnAt: 5000, completeAt: 41000, parentId: "conductor" },

	{ id: "story-01", spawnAt: 6500, completeAt: 16500, parentId: "story-factory" },
	{ id: "story-02", spawnAt: 6900, completeAt: 16000, parentId: "story-factory" },
	{ id: "story-03", spawnAt: 7400, completeAt: 17500, parentId: "story-factory" },
	{ id: "story-04", spawnAt: 7900, completeAt: 17200, parentId: "story-factory" },

	{ id: "story-05", spawnAt: 12500, completeAt: 23000, parentId: "story-factory" },
	{ id: "story-06", spawnAt: 12900, completeAt: 22500, parentId: "story-factory" },
	{ id: "story-07", spawnAt: 13400, completeAt: 24000, parentId: "story-factory" },

	{ id: "story-08", spawnAt: 18500, completeAt: 30000, parentId: "story-factory" },
	{ id: "story-09", spawnAt: 19000, completeAt: 29500, parentId: "story-factory" },
	{ id: "story-10", spawnAt: 19500, completeAt: 31000, parentId: "story-factory" },
]

export const RUN_DURATION_MS = 43000
export const RESET_DELAY_MS = 3500

const BY_ID = new Map(RUN_SCRIPT.map((s) => [s.id, s]))

export function lookupScript(id: string): AgentScript | undefined {
	return BY_ID.get(id)
}

export type AgentLifeState = "hidden" | "active" | "completed"

export function agentStateAt(
	id: string,
	simTimeMs: number,
): AgentLifeState {
	const s = BY_ID.get(id)
	if (!s) return "hidden"
	if (simTimeMs < s.spawnAt) return "hidden"
	if (simTimeMs < s.completeAt) return "active"
	return "completed"
}
