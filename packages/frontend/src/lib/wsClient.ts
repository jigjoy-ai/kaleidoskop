import type {
	ParticipantInfo,
	ReplayEvent,
	ReplaySeekBurst,
	ReplayStateSnapshot,
	StreamMessage,
} from "@kaleidoskop/shared"

import { track } from "./analytics"
import { SEEK_BURST_WALL_MS, useReplayClock } from "./replayClock"
import type { AgentLifeState } from "./runScript"
import { generateParticipants } from "./participants"

const SEEK_BURST_FINISH_MS = 1850

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

	/**
	 * Replace the entire lifecycle map. Called by the snapshot handler
	 * after a seek so subsequent event transitions branch off the
	 * backend-computed state rather than whatever we had accumulated
	 * before the scrub.
	 */
	reset(states: Record<string, AgentLifeState>): void {
		this.states = new Map(Object.entries(states))
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
	let burstTimers: number[] = []
	let burstToken = 0

	const remap = (backendId: string): string => {
		if (backendId in BACKEND_TO_LAYOUT_ID) {
			return BACKEND_TO_LAYOUT_ID[backendId]!
		}
		if (backendId.startsWith("story-")) {
			return allocator.allocate(backendId)
		}
		return backendId
	}

	const clearBurstTimers = () => {
		burstToken += 1
		for (const timer of burstTimers) {
			window.clearTimeout(timer)
		}
		burstTimers = []
		store.getState().cancelSeekBurst()
	}

	socket.addEventListener("open", () => {
		store.getState().resetRun()
		store.getState().setSourceMode("connecting")
		store.getState().setBackendCommandSender((cmd) => {
			if (socket.readyState === socket.OPEN) {
				socket.send(JSON.stringify(cmd))
			}
		})
		track("ws_connected", { url })
	})

	socket.addEventListener("error", () => {
		clearBurstTimers()
		store.getState().setSourceMode("error", "WebSocket error")
		store.getState().setBackendCommandSender(null)
	})

	socket.addEventListener("close", () => {
		clearBurstTimers()
		store.getState().setBackendCommandSender(null)
		store.getState().resetRunDuration()
		store.getState().resetParticipants()
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
				if (msg.meta?.durationMs && msg.meta.durationMs > 0) {
					store.getState().setRunDurationMs(msg.meta.durationMs)
				}
				store.getState().setSourceMode("live")
				track("ws_hello_received", {
					participantCount: msg.participants.length,
					durationMs: msg.meta?.durationMs ?? null,
					eventCount: msg.meta?.eventCount ?? null,
				})
				return
			}
			case "event": {
				handleEvent(msg.event, remap, lifecycle)
				return
			}
			case "snapshot": {
				clearBurstTimers()
				handleSnapshot(msg.snapshot, remap, lifecycle)
				return
			}
			case "seek_burst": {
				clearBurstTimers()
				const token = burstToken
				const nextTimers = handleSeekBurst(
					msg.burst,
					remap,
					lifecycle,
					() => token === burstToken,
				)
				burstTimers = nextTimers
				return
			}
			case "done": {
				clearBurstTimers()
				// Run completed naturally. Don't reset state, don't
				// flip back to "demo" — that would let the scripted
				// driver kick in on top of the loaded events, and the
				// auto-connect effect would immediately re-open a
				// socket and replay the whole thing. "finished" tells
				// the rest of the app: lifecycle is final, no more
				// events incoming, but the timeline stays scrubbable.
				store.getState().setSourceMode("finished")
				try {
					socket.close()
				} catch {
					/* noop */
				}
				return
			}
			case "error": {
				clearBurstTimers()
				store.getState().setSourceMode("error", msg.message)
				return
			}
		}
	})

	return {
		close: () => {
			clearBurstTimers()
			try {
				socket.close()
			} catch {
				/* noop */
			}
		},
	}
}

/** Read the current layout roster from the store. */
function currentRoster(): Map<string, unknown> {
	return useReplayClock.getState().participantById
}

function handleHello(
	participants: readonly ParticipantInfo[],
	remap: (id: string) => string,
	lifecycle: LiveLifecycle,
): void {
	// Count story participants so we can size the honeycomb layout
	// before seeding lifecycle state. Backend ids for story sources
	// start with `story-`; non-story participants (operator, conductor,
	// observers, drivers) come through with their canonical names.
	const storyCount = participants.filter((p) => p.role === "story").length
	useReplayClock.getState().setParticipants(generateParticipants(storyCount))

	// Seed every discovered participant in `hidden` state. They transition
	// to `active` on their first event and to `completed` when an
	// `agent_state phase: done/failed/aborted` or `story_result` event
	// arrives. This lets the live mode reproduce the same spawn/complete
	// drama the scripted demo has — driven by real audit-log events.
	const roster = currentRoster()
	for (const p of participants) {
		const layoutId = remap(p.id)
		if (roster.has(layoutId)) {
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

	const roster = currentRoster()
	// Drop events whose source isn't in the current honeycomb roster
	// (plugin metadata leakage, unknown participants). Frontend would
	// otherwise crash trying to render a hex it doesn't have a position
	// for.
	if (!roster.has(remappedSource)) return

	const remappedEvent: ReplayEvent = {
		...event,
		sourceId: remappedSource,
		subscriberIds: remappedSubs.filter((id) => roster.has(id)),
	}

	if (lifecycle.apply(remappedEvent, remappedSource)) {
		useReplayClock.getState().setAgentStates(lifecycle.snapshot())
	}

	// Advance the playback clock to the latest event timestamp so the
	// progress bar tracks where we are inside the run. Don't go
	// backwards — events can arrive slightly out of order on the wire.
	const currentSim = useReplayClock.getState().simTimeMs
	if (remappedEvent.at > currentSim) {
		useReplayClock.getState().setSimTime(remappedEvent.at)
	}

	useReplayClock.getState().emit(remappedEvent)
}

function handleSnapshot(
	snap: ReplayStateSnapshot,
	remap: (id: string) => string,
	lifecycle: LiveLifecycle,
): void {
	const remapped = remapSnapshot(snap, remap)
	lifecycle.reset(remapped.agentState)
	useReplayClock.getState().applySnapshot(remapped)
}

function remapSnapshot(
	snap: ReplayStateSnapshot,
	remap: (id: string) => string,
): {
	atMs: number
	eventCount: number
	agentState: Record<string, AgentLifeState>
	recent: ReplayEvent[]
} {
	const roster = currentRoster()
	// Remap backend ids onto layout ids and drop anything we can't
	// render. Snapshot semantics: replace state wholesale at the
	// seek-target moment.
	const remappedState: Record<string, AgentLifeState> = {}
	for (const [backendId, state] of Object.entries(snap.agentState)) {
		const layoutId = remap(backendId)
		if (roster.has(layoutId)) {
			remappedState[layoutId] = state
		}
	}

	const remappedRecent: ReplayEvent[] = []
	for (const e of snap.recent) {
		const source = remap(e.sourceId)
		if (!roster.has(source)) continue
		remappedRecent.push({
			...e,
			sourceId: source,
			subscriberIds: e.subscriberIds
				.map(remap)
				.filter((id) => roster.has(id)),
		})
	}

	return {
		atMs: snap.atMs,
		eventCount: snap.eventCount,
		agentState: remappedState,
		recent: remappedRecent,
	}
}

function handleSeekBurst(
	burst: ReplaySeekBurst,
	remap: (id: string) => string,
	lifecycle: LiveLifecycle,
	isCurrent: () => boolean,
): number[] {
	const roster = currentRoster()
	const remappedSnapshot = remapSnapshot(burst.snapshot, remap)
	const events: ReplayEvent[] = []

	for (const event of burst.events) {
		const source = remap(event.sourceId)
		if (!roster.has(source)) continue
		events.push({
			...event,
			sourceId: source,
			subscriberIds: event.subscriberIds
				.map(remap)
				.filter((id) => roster.has(id)),
		})
	}

	if (events.length === 0) {
		lifecycle.reset(remappedSnapshot.agentState)
		useReplayClock.getState().applySnapshot(remappedSnapshot)
		return []
	}

	const timers: number[] = []
	const firstAt = events[0]?.at ?? 0
	const lastAt = events[events.length - 1]?.at ?? firstAt
	const lastIndex = events.length - 1

	useReplayClock.getState().beginSeekBurst()
	for (const [index, event] of events.entries()) {
		// Backward seeks are still played chronologically forward: ripples
		// encode source/subscriber flow, and the final snapshot below is the
		// authoritative destination state.
		const delay =
			lastAt > firstAt
				? ((event.at - firstAt) / (lastAt - firstAt)) * SEEK_BURST_WALL_MS
				: lastIndex > 0
					? (index / lastIndex) * SEEK_BURST_WALL_MS
					: 0
		timers.push(
			window.setTimeout(() => {
				if (!isCurrent()) return
				useReplayClock.getState().emitBurstEvent(event, performance.now())
			}, delay),
		)
	}

	timers.push(
		window.setTimeout(() => {
			if (!isCurrent()) return
			lifecycle.reset(remappedSnapshot.agentState)
			useReplayClock.getState().finishSeekBurst(remappedSnapshot)
		}, SEEK_BURST_FINISH_MS),
	)

	return timers
}
