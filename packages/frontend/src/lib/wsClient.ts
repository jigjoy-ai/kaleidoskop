import type {
	ParticipantInfo,
	ReplayEvent,
	StreamMessage,
} from "@mozaik-replay/shared"

import { useReplayClock } from "./replayClock"
import type { AgentLifeState } from "./runScript"
import { PARTICIPANT_BY_ID } from "./participants"

/**
 * Map a backend-discovered participant id onto a slot in the existing
 * hard-coded honeycomb layout. The frontend's layout knows about a
 * fixed roster (conductor + 6 observers + 12 ring-2 slots); backend
 * sources are mostly the same names plus story agents with raw audit-log
 * ids (`story-S1`, `story-S2`, …) that we translate to the layout's
 * sequential story ids (`story-01`, `story-02`, …) in the order we
 * first see them.
 *
 * This is a placeholder until we move to dynamic layout — at which
 * point this whole mapping disappears and the layout consumes the
 * `participants` field of the `hello` message directly.
 */
class StoryIdAllocator {
	private next = 1
	private cache = new Map<string, string>()

	allocate(backendId: string): string {
		const cached = this.cache.get(backendId)
		if (cached) return cached
		const id = `story-${String(this.next).padStart(2, "0")}`
		this.next += 1
		this.cache.set(backendId, id)
		return id
	}
}

const BACKEND_TO_LAYOUT_ID: Record<string, string> = {
	conductor: "conductor",
	operator: "operator",
	"story-factory": "story-factory",
	critic: "critic",
	surgeon: "surgeon",
	librarian: "librarian",
	sentry: "sentry",
	auditor: "auditor",
	finalizer: "finalizer",
}

/** Live lifecycle bookkeeping for the active WS session. */
class LiveLifecycle {
	private states = new Map<string, AgentLifeState>()

	seedHidden(layoutId: string): void {
		if (!this.states.has(layoutId)) {
			this.states.set(layoutId, "hidden")
		}
	}

	/**
	 * Update the lifecycle for an event's source. Returns true if the
	 * caller should flush the state map to the store, false otherwise
	 * (e.g. no transition happened — avoid noisy zustand updates).
	 */
	apply(event: ReplayEvent, layoutSourceId: string): boolean {
		const current = this.states.get(layoutSourceId) ?? "hidden"
		const next = this.resolveNext(event, current)
		if (next === current) return false
		this.states.set(layoutSourceId, next)
		return true
	}

	snapshot(): Record<string, AgentLifeState> {
		return Object.fromEntries(this.states.entries())
	}

	private resolveNext(
		event: ReplayEvent,
		current: AgentLifeState,
	): AgentLifeState {
		// Story-level terminal states: agent_state with phase done/failed
		// /aborted, OR a story_result event (covers cases where Claude
		// emitted result without a clean phase transition).
		if (event.domain === "agent_state") {
			const phase = (event.data?.phase ?? "") as string
			if (phase === "done" || phase === "failed" || phase === "aborted") {
				return "completed"
			}
			return current === "completed" ? "completed" : "active"
		}
		if (event.domain === "story_result") {
			return "completed"
		}
		if (event.domain === "run_completed") {
			// run completing doesn't transition the Conductor by itself —
			// the audit log usually has a final conductor_state phase=done
			// right after. Don't force terminal here.
			return current === "hidden" ? "active" : current
		}
		// Any other event from a hidden source → mark active. Don't
		// downgrade an already-completed participant.
		if (current === "completed") return "completed"
		return "active"
	}
}

export interface WsClientHandle {
	close: () => void
}

export function connectToBackend(url: string): WsClientHandle {
	const store = useReplayClock
	store.getState().setSourceMode("connecting")

	const socket = new WebSocket(url)
	const allocator = new StoryIdAllocator()
	const lifecycle = new LiveLifecycle()

	const remap = (backendId: string): string => {
		if (backendId in BACKEND_TO_LAYOUT_ID) {
			return BACKEND_TO_LAYOUT_ID[backendId]!
		}
		if (backendId.startsWith("story-")) {
			return allocator.allocate(backendId)
		}
		return backendId
	}

	socket.addEventListener("open", () => {
		store.getState().resetRun()
		store.getState().setSourceMode("connecting")
		store.getState().setBackendCommandSender((cmd) => {
			if (socket.readyState === socket.OPEN) {
				socket.send(JSON.stringify(cmd))
			}
		})
	})

	socket.addEventListener("error", () => {
		store.getState().setSourceMode("error", "WebSocket error")
		store.getState().setBackendCommandSender(null)
	})

	socket.addEventListener("close", () => {
		store.getState().setBackendCommandSender(null)
		const current = store.getState().sourceMode
		if (current === "live" || current === "connecting") {
			store.getState().setSourceMode("demo")
		}
	})

	socket.addEventListener("message", (evt) => {
		let msg: StreamMessage
		try {
			msg = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data))
		} catch {
			return
		}

		switch (msg.kind) {
			case "hello": {
				handleHello(msg.participants, remap, lifecycle)
				store.getState().setSourceMode("live")
				return
			}
			case "event": {
				handleEvent(msg.event, remap, lifecycle)
				return
			}
			case "done": {
				store.getState().setSourceMode("demo")
				try {
					socket.close()
				} catch {
					/* noop */
				}
				return
			}
			case "error": {
				store.getState().setSourceMode("error", msg.message)
				return
			}
		}
	})

	return {
		close: () => {
			try {
				socket.close()
			} catch {
				/* noop */
			}
		},
	}
}

function handleHello(
	participants: readonly ParticipantInfo[],
	remap: (id: string) => string,
	lifecycle: LiveLifecycle,
): void {
	// Seed every discovered participant in `hidden` state. They transition
	// to `active` on their first event and to `completed` when an
	// `agent_state phase: done/failed/aborted` or `story_result` event
	// arrives. This lets the live mode reproduce the same spawn/complete
	// drama the scripted demo has — driven by real audit-log events.
	for (const p of participants) {
		const layoutId = remap(p.id)
		if (PARTICIPANT_BY_ID.has(layoutId)) {
			lifecycle.seedHidden(layoutId)
		}
	}
	useReplayClock.getState().setAgentStates(lifecycle.snapshot())
}

function handleEvent(
	event: ReplayEvent,
	remap: (id: string) => string,
	lifecycle: LiveLifecycle,
): void {
	const remappedSource = remap(event.sourceId)
	const remappedSubs = event.subscriberIds.map(remap)

	// Drop events whose source isn't in the current honeycomb roster
	// (plugin metadata leakage, unknown participants). Frontend would
	// otherwise crash trying to render a hex it doesn't have a position
	// for.
	if (!PARTICIPANT_BY_ID.has(remappedSource)) return

	const remappedEvent: ReplayEvent = {
		...event,
		sourceId: remappedSource,
		subscriberIds: remappedSubs.filter((id) => PARTICIPANT_BY_ID.has(id)),
	}

	if (lifecycle.apply(remappedEvent, remappedSource)) {
		useReplayClock.getState().setAgentStates(lifecycle.snapshot())
	}

	useReplayClock.getState().emit(remappedEvent)
}
