import {
	EMITTERS,
	PARTICIPANT_BY_ID,
	STORY_IDS,
	SUBSCRIBERS,
} from "./participants"
import { BUCKET_OF, DOMAIN_LABEL } from "./eventTypes"
import type { DomainEvent, ReplayEvent } from "./types"

let idCounter = 0

function pickFrom<T>(arr: readonly T[]): T | undefined {
	if (arr.length === 0) return undefined
	return arr[Math.floor(Math.random() * arr.length)]
}

// Per-role event-type distribution. Mirrors what each participant actually
// emits during a baro run.
//
// All probabilities are weights (relative, not normalised).
const ROLE_EMIT_WEIGHTS: Record<string, Partial<Record<DomainEvent, number>>> =
	{
		conductor: {
			level_started: 1,
			level_completed: 1,
			story_spawn_request: 4,
			agent_targeted_message: 2,
		},
		operator: {
			agent_targeted_message: 1,
		},
		"story-factory": {
			story_spawned: 1,
		},
		critic: {
			critique: 3,
			function_call: 2,
			function_call_output: 2,
			agent_targeted_message: 1,
		},
		surgeon: {
			function_call: 2,
			function_call_output: 1,
			replan: 0.4,
		},
		librarian: {
			knowledge: 1,
			agent_targeted_message: 0.4,
		},
		sentry: {
			coordination: 0.3,
		},
		auditor: {},
		finalizer: {
			function_call: 1,
		},
		// Stories — broadest spread (LLM workhorses)
		story: {
			function_call: 5,
			function_call_output: 5,
			reasoning: 4,
			model_message: 2,
			agent_state: 1,
			agent_result: 1,
			error: 0.15,
		},
	}

function roleFor(id: string): string {
	if (id.startsWith("story-") && id !== "story-factory") return "story"
	return id
}

const PRECOMPUTED_TYPE_TABLES = new Map<string, DomainEvent[]>()

function typeTable(role: string): DomainEvent[] {
	const cached = PRECOMPUTED_TYPE_TABLES.get(role)
	if (cached) return cached
	const weights = ROLE_EMIT_WEIGHTS[role] ?? {}
	const table: DomainEvent[] = []
	for (const [type, weight] of Object.entries(weights) as [
		DomainEvent,
		number,
	][]) {
		const slots = Math.max(1, Math.round(weight * 10))
		for (let i = 0; i < slots; i++) table.push(type)
	}
	PRECOMPUTED_TYPE_TABLES.set(role, table)
	return table
}

function pickTypeFor(id: string): DomainEvent | null {
	const table = typeTable(roleFor(id))
	return table.length === 0
		? null
		: table[Math.floor(Math.random() * table.length)]
}

function payloadFor(domain: DomainEvent, sourceLabel: string): string {
	switch (domain) {
		case "agent_state":
			return `${sourceLabel} → phase: running`
		case "story_spawn_request":
			return `Conductor → spawn story (level 2)`
		case "story_spawned":
			return `StoryFactory → joined ${sourceLabel}`
		case "level_started":
			return `Conductor → LevelStarted(${Math.floor(Math.random() * 3 + 1)})`
		case "level_completed":
			return `Conductor → LevelCompleted`
		case "run_started":
			return `Conductor → RunStarted`
		case "run_completed":
			return `Conductor → RunCompleted`
		case "function_call":
			return `${sourceLabel} → Edit(src/lib/replayClock.ts)`
		case "function_call_output":
			return `${sourceLabel} ← tool result (12kb)`
		case "reasoning":
			return `${sourceLabel} streaming reasoning chunk`
		case "model_message":
			return `${sourceLabel} → final response`
		case "agent_result":
			return `${sourceLabel} → turn complete`
		case "story_result":
			return `${sourceLabel} → PASSED`
		case "critique":
			return `Critic → ${sourceLabel}: pass`
		case "knowledge":
			return `Librarian → knowledge: package.json read`
		case "replan":
			return `Surgeon → replan: drop story-${Math.floor(Math.random() * 9 + 1)}`
		case "coordination":
			return `Sentry → overlap on src/components/HexGrid.tsx`
		case "agent_targeted_message":
			return `${sourceLabel} → ${DOMAIN_LABEL[domain]}`
		case "conductor_state":
			return `Conductor → phase transition`
		case "claude_system":
			return `${sourceLabel} → claude init`
		case "claude_rate_limit":
			return `${sourceLabel} → rate limit info`
		case "unknown":
			return `${sourceLabel} → ${DOMAIN_LABEL[domain]}`
		case "error":
			return `${sourceLabel} raised "rate limit; retrying"`
	}
}

function build(
	at: number,
	domain: DomainEvent,
	sourceId: string,
): ReplayEvent {
	idCounter += 1
	let subs = [...SUBSCRIBERS[domain]]
	// agent_targeted_message has a dynamic recipient. Splice in a random story
	// (or the source if no stories are around).
	if (domain === "agent_targeted_message") {
		const candidate = pickFrom(STORY_IDS)
		if (candidate && !subs.includes(candidate)) subs.push(candidate)
	}
	const sourceLabel = PARTICIPANT_BY_ID.get(sourceId)?.label ?? sourceId
	return {
		id: `e${idCounter}`,
		at,
		domain,
		bucket: BUCKET_OF[domain],
		sourceId,
		subscriberIds: subs,
		payload: payloadFor(domain, sourceLabel),
	}
}

export function nextEvent(
	now: number,
	activeIds: readonly string[],
	selectedAgentId: string | null,
): ReplayEvent | null {
	if (activeIds.length === 0) return null

	const candidates: string[] = []
	if (selectedAgentId !== null) {
		if (!activeIds.includes(selectedAgentId)) return null
		candidates.push(selectedAgentId)
	} else {
		// Stories are the bulk of the traffic — weight them up.
		const stories = activeIds.filter((id) => id.startsWith("story-") && id !== "story-factory")
		if (stories.length > 0 && Math.random() < 0.62) {
			candidates.push(...stories)
		} else {
			candidates.push(...activeIds)
		}
	}

	const sourceId = pickFrom(candidates)!
	const domain = pickTypeFor(sourceId)
	if (!domain) return null
	// Ensure this source can actually emit this domain (cross-check EMITTERS).
	const emitters = EMITTERS[domain]
	if (
		!emitters.includes(sourceId) &&
		!(emitters.length === 0)
	) {
		// Fall back to source itself emitting a more generic shape.
		return build(now, "agent_state", sourceId)
	}
	return build(now, domain, sourceId)
}

export function spawnEvent(
	now: number,
	parentId: string,
	childId: string,
): ReplayEvent {
	idCounter += 1
	const childLabel = PARTICIPANT_BY_ID.get(childId)?.label ?? childId

	// Two spawn shapes, mirroring how baro actually works:
	//   - StoryFactory creating a StoryAgent: StoryFactory emits
	//     `story_spawned`; we splice the new story into the subscriber list so
	//     the new hex lights up alongside Auditor.
	//   - Everything else (Conductor "spawning" an observer in our script) is
	//     really an attach — the new participant broadcasts its own
	//     `agent_state` once it's on the bus. Source = child.
	if (parentId === "story-factory") {
		const domain: DomainEvent = "story_spawned"
		const subs = [...SUBSCRIBERS[domain], childId]
		return {
			id: `e${idCounter}-spawn`,
			at: now,
			domain,
			bucket: BUCKET_OF[domain],
			sourceId: parentId,
			subscriberIds: subs,
			payload: `StoryFactory → spawned(${childLabel})`,
		}
	}

	const domain: DomainEvent = "agent_state"
	return {
		id: `e${idCounter}-attach`,
		at: now,
		domain,
		bucket: BUCKET_OF[domain],
		sourceId: childId,
		subscriberIds: SUBSCRIBERS[domain],
		payload: `${childLabel} → phase: starting`,
	}
}
