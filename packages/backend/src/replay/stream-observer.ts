import {
	BaseObserver,
	FunctionCallItem,
	FunctionCallOutputItem,
	ModelMessageItem,
	Participant,
	ReasoningItem,
	SemanticEvent,
} from "@mozaik-ai/core"
import type { StreamMessage } from "@mozaik-replay/shared"

/**
 * Mozaik observer that captures every event the replay environment
 * delivers and forwards it to the WebSocket client as a typed
 * `StreamMessage` envelope. One instance per replay session.
 *
 * Because Mozaik's pub/sub fan-out is run inside the backend, this
 * observer is structurally identical to any production observer (e.g.
 * Cartographer in baro) — same `BaseObserver` base, same handler
 * methods. The only difference is the side-effect: instead of rendering
 * to a TUI or mutating local state, it pushes a `StreamMessage` to a
 * sink (the WebSocket).
 */
export class StreamObserver extends BaseObserver {
	constructor(private readonly sink: (msg: StreamMessage) => void) {
		super()
	}

	override async onExternalEvent(
		source: Participant,
		event: SemanticEvent<unknown>,
	): Promise<void> {
		this.sink({
			kind: "event",
			event: {
				id: makeEventId(),
				at: Date.now(),
				domain: (event.type as never) ?? "unknown",
				bucket: "lifecycle",
				sourceId: labelOf(source),
				subscriberIds: [],
				payload: JSON.stringify(event.data ?? {}).slice(0, 200),
			},
		})
	}

	override async onExternalFunctionCall(
		source: Participant,
		item: FunctionCallItem,
	): Promise<void> {
		this.forwardLlmItem(source, "function_call", "tool_call", {
			callId: item.callId,
			name: item.name,
			args: item.args,
		})
	}

	override async onExternalFunctionCallOutput(
		source: Participant,
		item: FunctionCallOutputItem,
	): Promise<void> {
		this.forwardLlmItem(source, "function_call_output", "tool_call", {
			callId: item.callId,
		})
	}

	override async onExternalReasoning(
		source: Participant,
		_item: ReasoningItem,
	): Promise<void> {
		this.forwardLlmItem(source, "reasoning", "reasoning", {})
	}

	override async onExternalModelMessage(
		source: Participant,
		_item: ModelMessageItem,
	): Promise<void> {
		this.forwardLlmItem(source, "model_message", "reasoning", {})
	}

	private forwardLlmItem(
		source: Participant,
		domain: string,
		bucket: string,
		extra: Record<string, unknown>,
	): void {
		this.sink({
			kind: "event",
			event: {
				id: makeEventId(),
				at: Date.now(),
				domain: domain as never,
				bucket: bucket as never,
				sourceId: labelOf(source),
				subscriberIds: [],
				payload: JSON.stringify(extra).slice(0, 200),
			},
		})
	}
}

function labelOf(p: Participant): string {
	const id = (p as unknown as { participantId?: string; id?: string }).participantId
		?? (p as unknown as { id?: string }).id
	return typeof id === "string" ? id : p.constructor.name
}

let _eventCounter = 0
function makeEventId(): string {
	_eventCounter += 1
	return `live-${_eventCounter}`
}
