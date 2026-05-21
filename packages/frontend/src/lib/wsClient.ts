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

export interface WsClientHandle {
	close: () => void
}

export function connectToBackend(url: string): WsClientHandle {
	const store = useReplayClock
	store.getState().setSourceMode("connecting")

	const socket = new WebSocket(url)
	const allocator = new StoryIdAllocator()

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
		// reset run state so the live data lands in a clean store —
		// scripted demo lifecycle/firing/ripples are wiped.
		store.getState().resetRun()
		store.getState().setSourceMode("connecting")
		// Expose a command sender so PlaybackControls can round-trip
		// play/pause/speed to the backend ReplaySession.
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
				handleHello(msg.participants, remap)
				store.getState().setSourceMode("live")
				return
			}
			case "event": {
				handleEvent(msg.event, remap)
				return
			}
			case "done": {
				store.getState().setSourceMode("demo")
				// Close the socket so the backend can tear down its
				// ReplaySession instead of leaving an idle WS open.
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
): void {
	// Mark every discovered participant that has a layout slot as active
	// from t=0. Lifecycle (spawn → active → completed) isn't reconstructed
	// from the audit log yet — we just want the right hexes visible.
	const states: Record<string, AgentLifeState> = {}
	for (const p of participants) {
		const layoutId = remap(p.id)
		if (PARTICIPANT_BY_ID.has(layoutId)) {
			states[layoutId] = "active"
		}
	}
	useReplayClock.getState().setAgentStates(states)
}

function handleEvent(
	event: ReplayEvent,
	remap: (id: string) => string,
): void {
	const remappedSource = remap(event.sourceId)
	const remappedSubs = event.subscriberIds.map(remap)

	// Drop events whose source isn't in the current honeycomb roster
	// (plugin metadata leakage, unknown participants). Frontend would
	// otherwise crash trying to render a hex it doesn't have a position
	// for.
	if (!PARTICIPANT_BY_ID.has(remappedSource)) return

	useReplayClock.getState().emit({
		...event,
		sourceId: remappedSource,
		subscriberIds: remappedSubs.filter((id) => PARTICIPANT_BY_ID.has(id)),
	})
}
