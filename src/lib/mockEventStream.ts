import { EDGES, PARTICIPANTS } from "./participants"
import { EVENT_TYPES } from "./eventColor"
import type { EventType, ReplayEvent } from "./types"

const TYPE_WEIGHT: Record<EventType, number> = {
	tool_call: 5,
	stream: 4,
	lifecycle: 2,
	verdict: 2,
	web_search: 1,
	file_edit: 2,
	error: 0.3,
}

const WEIGHTED_TYPES: EventType[] = (() => {
	const out: EventType[] = []
	for (const t of EVENT_TYPES) {
		const slots = Math.max(1, Math.round(TYPE_WEIGHT[t] * 10))
		for (let i = 0; i < slots; i++) out.push(t)
	}
	return out
})()

function pickType(): EventType {
	return WEIGHTED_TYPES[Math.floor(Math.random() * WEIGHTED_TYPES.length)]
}

function pickEdge() {
	return EDGES[Math.floor(Math.random() * EDGES.length)]
}

function samplePayload(type: EventType, sourceLabel: string): string {
	switch (type) {
		case "tool_call":
			return `${sourceLabel} → Edit(src/components/HexGrid.tsx)`
		case "stream":
			return `${sourceLabel} streaming reasoning tokens…`
		case "lifecycle":
			return `${sourceLabel} reached checkpoint`
		case "verdict":
			return `Critic → ${sourceLabel}: PASS`
		case "error":
			return `${sourceLabel} raised "rate limit; retrying"`
		case "web_search":
			return `${sourceLabel} → WebSearch("d3 hex layout")`
		case "file_edit":
			return `${sourceLabel} → Write(src/lib/replayClock.ts)`
	}
}

const PARTICIPANT_LABEL = new Map(PARTICIPANTS.map((p) => [p.id, p.label]))

let idCounter = 0

export function generateEvent(now: number): ReplayEvent {
	const edge = pickEdge()
	const type = pickType()
	// Half the time we fire source→target, half target→source — both directions
	// live on the bus, this just affects which end the spike enters first.
	const reverse = Math.random() < 0.5
	const sourceId = reverse ? edge.targetId : edge.sourceId
	const targetId = reverse ? edge.sourceId : edge.targetId
	const sourceLabel = PARTICIPANT_LABEL.get(sourceId) ?? sourceId
	idCounter += 1
	return {
		id: `e${idCounter}`,
		at: now,
		type,
		sourceId,
		targetId,
		payload: samplePayload(type, sourceLabel),
	}
}
