import type { EventType } from "./types"

export const EVENT_COLOR: Record<EventType, string> = {
	tool_call: "#b97bff",
	stream: "#5dd6e8",
	lifecycle: "#7fd97f",
	verdict: "#f5c95c",
	error: "#f87f7f",
	web_search: "#7faaf5",
	file_edit: "#ffa86c",
}

export const EVENT_LABEL: Record<EventType, string> = {
	tool_call: "tool call",
	stream: "stream",
	lifecycle: "lifecycle",
	verdict: "verdict",
	error: "error",
	web_search: "web search",
	file_edit: "file edit",
}

export const EVENT_TYPES: readonly EventType[] = Object.keys(
	EVENT_COLOR,
) as readonly EventType[]
