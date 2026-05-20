export type EventType =
	| "tool_call"
	| "stream"
	| "lifecycle"
	| "verdict"
	| "error"
	| "web_search"
	| "file_edit"

export interface Participant {
	id: string
	label: string
	ring: 0 | 1 | 2
	ringIndex: number
}

export interface ReplayEvent {
	id: string
	at: number
	type: EventType
	sourceId: string
	targetId: string
	payload: string
}

export interface Edge {
	sourceId: string
	targetId: string
}

export interface PixelCoord {
	x: number
	y: number
}
