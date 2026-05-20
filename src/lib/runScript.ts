// Scripted timeline of a fictional baro run. Drives spawn/active/complete
// transitions in the visualization. Times are ms from run start.
//
// Phase shape (matches a real baro run):
//   t=0      Architect appears
//   t=1.5s   Reader, Conductor are spawned by Architect
//   t=4-5s   Planner appears and starts decomposing the goal
//   t=7-8s   Critic, Surgeon come online
//   t=10s    First wave of Story Agents — four spawn in quick succession
//   t=16s    Second wave (when wave 1 is mostly mid-flight)
//   t=23s    Third wave
//   t=38s    Finalizer composes the PR
//   t=44s    Architect signs off

export interface AgentScript {
	id: string
	spawnAt: number
	completeAt: number
	parentId?: string
}

export const RUN_SCRIPT: AgentScript[] = [
	{ id: "architect", spawnAt: 0, completeAt: 44000 },
	{ id: "reader", spawnAt: 1800, completeAt: 41500, parentId: "architect" },
	{ id: "conductor", spawnAt: 2800, completeAt: 42500, parentId: "architect" },
	{ id: "planner", spawnAt: 4500, completeAt: 9500, parentId: "architect" },
	{ id: "critic", spawnAt: 7200, completeAt: 40500, parentId: "architect" },
	{ id: "surgeon", spawnAt: 7800, completeAt: 40000, parentId: "architect" },

	{ id: "story-01", spawnAt: 10500, completeAt: 20500, parentId: "planner" },
	{ id: "story-02", spawnAt: 11000, completeAt: 19500, parentId: "planner" },
	{ id: "story-03", spawnAt: 11600, completeAt: 21500, parentId: "planner" },
	{ id: "story-04", spawnAt: 12100, completeAt: 20800, parentId: "planner" },

	{ id: "story-05", spawnAt: 16800, completeAt: 27500, parentId: "planner" },
	{ id: "story-06", spawnAt: 17300, completeAt: 27000, parentId: "planner" },
	{ id: "story-07", spawnAt: 17900, completeAt: 28500, parentId: "planner" },
	{ id: "story-08", spawnAt: 18500, completeAt: 27800, parentId: "planner" },

	{ id: "story-09", spawnAt: 23200, completeAt: 34500, parentId: "planner" },
	{ id: "story-10", spawnAt: 23700, completeAt: 34000, parentId: "planner" },
	{ id: "story-11", spawnAt: 24300, completeAt: 35500, parentId: "planner" },
	{ id: "story-12", spawnAt: 24900, completeAt: 34800, parentId: "planner" },

	{ id: "finalizer", spawnAt: 38000, completeAt: 43500, parentId: "architect" },
]

export const RUN_DURATION_MS = 45000
export const RESET_DELAY_MS = 3500

const BY_ID = new Map(RUN_SCRIPT.map((s) => [s.id, s]))

export function lookupScript(id: string): AgentScript | undefined {
	return BY_ID.get(id)
}

export type AgentLifeState = "hidden" | "active" | "completed"

export function agentStateAt(id: string, simTimeMs: number): AgentLifeState {
	const s = BY_ID.get(id)
	if (!s) return "hidden"
	if (simTimeMs < s.spawnAt) return "hidden"
	if (simTimeMs < s.completeAt) return "active"
	return "completed"
}
