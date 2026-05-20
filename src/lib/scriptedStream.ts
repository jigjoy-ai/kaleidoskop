import { PARTICIPANT_BY_ID } from "./participants"
import type { EventType, ReplayEvent } from "./types"

let idCounter = 0

function pickFrom<T>(arr: readonly T[]): T | undefined {
	if (arr.length === 0) return undefined
	return arr[Math.floor(Math.random() * arr.length)]
}

function isStory(id: string): boolean {
	return id.startsWith("story-")
}

function pickTypeForSource(id: string): EventType {
	if (id === "critic") return Math.random() < 0.7 ? "verdict" : "stream"
	if (id === "surgeon") return Math.random() < 0.55 ? "file_edit" : "tool_call"
	if (id === "reader") return Math.random() < 0.5 ? "tool_call" : "stream"
	if (id === "conductor") return "lifecycle"
	if (id === "planner") return Math.random() < 0.5 ? "stream" : "lifecycle"
	if (id === "finalizer")
		return Math.random() < 0.5 ? "tool_call" : "file_edit"
	if (id === "architect")
		return Math.random() < 0.5 ? "stream" : "lifecycle"
	// Story agents — broadest event spread
	const d = Math.random()
	if (d < 0.32) return "tool_call"
	if (d < 0.56) return "stream"
	if (d < 0.72) return "file_edit"
	if (d < 0.84) return "web_search"
	if (d < 0.94) return "lifecycle"
	return "error"
}

function pickTargetForSource(
	sourceId: string,
	activeIds: readonly string[],
): string {
	const others = activeIds.filter((a) => a !== sourceId)
	if (isStory(sourceId)) {
		const preferred = ["critic", "surgeon", "architect"].filter((t) =>
			activeIds.includes(t),
		)
		return pickFrom(preferred) ?? pickFrom(others) ?? sourceId
	}
	if (sourceId === "planner") {
		const stories = activeIds.filter(isStory)
		return pickFrom(stories) ?? pickFrom(others) ?? "architect"
	}
	if (sourceId === "critic" || sourceId === "surgeon") {
		const stories = activeIds.filter(isStory)
		return pickFrom(stories) ?? "architect"
	}
	// architect, reader, conductor, finalizer
	return pickFrom(others) ?? sourceId
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

function buildEvent(
	at: number,
	sourceId: string,
	targetId: string,
	type: EventType,
): ReplayEvent {
	idCounter += 1
	const sourceLabel = PARTICIPANT_BY_ID.get(sourceId)?.label ?? sourceId
	return {
		id: `e${idCounter}`,
		at,
		type,
		sourceId,
		targetId,
		payload: samplePayload(type, sourceLabel),
	}
}

export function nextEvent(
	now: number,
	activeIds: readonly string[],
	selectedAgentId: string | null,
): ReplayEvent | null {
	if (activeIds.length === 0) return null
	let sourceId: string
	if (selectedAgentId !== null) {
		if (!activeIds.includes(selectedAgentId)) return null
		// Half the time the selected agent emits; the rest of the time another
		// active agent emits *to* the selected one.
		if (Math.random() < 0.6) sourceId = selectedAgentId
		else {
			const others = activeIds.filter((a) => a !== selectedAgentId)
			sourceId = pickFrom(others) ?? selectedAgentId
		}
	} else {
		// Weight stories more heavily — they do the bulk of the work in a real run.
		const stories = activeIds.filter(isStory)
		if (stories.length > 0 && Math.random() < 0.6) {
			sourceId = pickFrom(stories)!
		} else {
			sourceId = pickFrom(activeIds)!
		}
	}
	let targetId: string
	if (selectedAgentId !== null && sourceId !== selectedAgentId) {
		targetId = selectedAgentId
	} else {
		targetId = pickTargetForSource(sourceId, activeIds)
	}
	const type = pickTypeForSource(sourceId)
	return buildEvent(now, sourceId, targetId, type)
}

export function spawnEvent(
	now: number,
	parentId: string,
	childId: string,
): ReplayEvent {
	idCounter += 1
	const parentLabel = PARTICIPANT_BY_ID.get(parentId)?.label ?? parentId
	const childLabel = PARTICIPANT_BY_ID.get(childId)?.label ?? childId
	return {
		id: `e${idCounter}-spawn`,
		at: now,
		type: "lifecycle",
		sourceId: parentId,
		targetId: childId,
		payload: `${parentLabel} → spawn(${childLabel})`,
	}
}
