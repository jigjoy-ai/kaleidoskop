import { create } from "zustand"
import type {
	EventBucket,
	FiringPulse,
	Participant,
	ReplayEvent,
	StreamCommand,
} from "./types"
import type { AgentLifeState } from "./runScript"
import { DEMO_PARTICIPANTS } from "./participants"
import { viewBoxFor } from "./hexLayout"

const MAX_RECENT = 60
const FIRE_HOLD_MS = 700
const RIPPLE_LIFE_MS = 1300

export const ZOOM_MIN = 0.55
export const ZOOM_MAX = 2.4
export const ZOOM_STEP = 0.15

export const RIPPLE_SPEED_PX_PER_SEC = 760
export const RIPPLE_MAX_RADIUS = 360
export const RIPPLE_VISUAL_DURATION_MS = 700

/** Wall-clock duration of the seek-burst animation. Spec range 1.5–2 s; pick mid-range. */
export const SEEK_BURST_DURATION_MS = 1750

/** Minimum gap between burst emits, so individual ripples register visually. */
export const SEEK_BURST_MIN_GAP_MS = 8

// Module-scoped imperative handles for the in-flight seek burst. Timer ids
// live outside the Zustand store because they are side-effect handles, not
// reactive state — nothing in the UI subscribes to them.
let burstTimers: ReturnType<typeof setTimeout>[] = []

/**
 * Replay clock source modes.
 *
 *   demo       — scripted-demo loop owns the simulation (no backend)
 *   connecting — backend socket opening, awaiting hello
 *   live       — backend hello received, events streaming in
 *   finished   — backend sent `done`, socket closed; events stay
 *                visible and the timeline stays scrubbable. Explicit
 *                product call: never auto-clear a finished run.
 *   error      — connect failed or backend pushed `error`
 */
export type SourceMode =
	| "demo"
	| "live"
	| "connecting"
	| "finished"
	| "error"

const DEFAULT_RUN_DURATION_MS = 45000

interface ReplayState {
	playing: boolean
	speed: number
	eventCount: number
	simTimeMs: number
	/**
	 * Total run length. Scripted demo defaults to 45 s (matches
	 * RUN_DURATION_MS in runScript.ts); live mode overwrites this from
	 * the `hello.meta.durationMs` envelope so the progress bar tracks
	 * the real audit log's wall-clock span.
	 */
	runDurationMs: number

	firing: Record<string, FiringPulse>
	activeRipples: ReplayEvent[]
	recent: ReplayEvent[]

	agentState: Record<string, AgentLifeState>
	selectedAgentId: string | null
	pausedFocus: ReplayEvent | null
	zoom: number

	/**
	 * Where events are coming from. In "demo" mode the local scripted
	 * runScript emits via useReplayDriver. In "live" mode the WS client
	 * pushes events from the backend; useReplayDriver becomes a no-op
	 * for emissions (but still GCs firing/ripples).
	 */
	sourceMode: SourceMode
	sourceError: string | null

	/**
	 * Set by the WS client when a live connection opens. PlaybackControls
	 * uses this to round-trip play/pause/speed commands to the backend
	 * ReplaySession in live mode; null in demo mode (local timing only).
	 */
	backendCommandSender: ((cmd: StreamCommand) => void) | null

	/**
	 * Current honeycomb participant roster. Defaults to the scripted
	 * demo's 19-cell layout (10 stories); the WS client overwrites this
	 * on `hello` to match the real run's story count, growing into ring
	 * 3 and ring 4 as needed.
	 */
	participants: Participant[]
	participantById: Map<string, Participant>
	viewBox: string

	togglePlaying: () => void
	setSpeed: (s: number) => void
	emit: (e: ReplayEvent) => void
	triggerSubscriber: (id: string, at: number, bucket: EventBucket) => void
	tick: (now: number) => void

	setSimTime: (t: number) => void
	setRunDurationMs: (ms: number) => void
	resetRunDuration: () => void
	setParticipants: (participants: Participant[]) => void
	resetParticipants: () => void
	setAgentStates: (states: Record<string, AgentLifeState>) => void
	/**
	 * Replace the entire post-seek state in one shot. Used by the
	 * WS client when the backend emits a `snapshot` message — restores
	 * agentState, eventCount, and recent-events list to what would have
	 * been visible at the seek target. Ephemeral visuals (firing /
	 * ripples) get cleared so we don't carry a "frozen" pulse from the
	 * previous position into the new one.
	 */
	applySnapshot: (snap: {
		atMs: number
		eventCount: number
		agentState: Record<string, AgentLifeState>
		recent: ReplayEvent[]
	}) => void

	/**
	 * Imperatively replay a burst of in-between events as eye-candy
	 * during a large scrub, then land on the destination snapshot.
	 * Each event is dispatched through the normal emit() pipeline so
	 * the existing ripple/firing visualization picks them up unchanged.
	 */
	playBurst: (
		events: ReplayEvent[],
		destSnapshot: {
			atMs: number
			eventCount: number
			agentState: Record<string, AgentLifeState>
			recent: ReplayEvent[]
		},
	) => void
	/** Clear every pending burst timer. Idempotent; safe to call on a fresh store. */
	cancelBurst: () => void

	selectAgent: (id: string | null) => void
	setPausedFocus: (e: ReplayEvent | null) => void

	setZoom: (z: number) => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void

	setSourceMode: (mode: SourceMode, err?: string | null) => void
	setBackendCommandSender: (
		fn: ((cmd: StreamCommand) => void) | null,
	) => void

	resetRun: () => void
}

const clamp = (v: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, v))

function maxRingOf(list: readonly Participant[]): number {
	let max = 0
	for (const p of list) if (p.ring > max) max = p.ring
	return max
}

export const useReplayClock = create<ReplayState>((set, get) => ({
	playing: true,
	speed: 1,
	eventCount: 0,
	simTimeMs: 0,
	runDurationMs: DEFAULT_RUN_DURATION_MS,

	firing: {},
	activeRipples: [],
	recent: [],

	agentState: {},
	selectedAgentId: null,
	pausedFocus: null,
	zoom: 1,

	sourceMode: "demo",
	sourceError: null,
	backendCommandSender: null,

	participants: DEMO_PARTICIPANTS,
	participantById: new Map(DEMO_PARTICIPANTS.map((p) => [p.id, p])),
	viewBox: viewBoxFor(maxRingOf(DEMO_PARTICIPANTS)),

	togglePlaying: () =>
		set((s) => {
			const nextPlaying = !s.playing
			if (!nextPlaying) {
				const lastEvent = s.recent[0] ?? null
				return { playing: false, pausedFocus: lastEvent }
			}
			return { playing: true, pausedFocus: null }
		}),

	setSpeed: (speed) => set({ speed }),

	emit: (event) =>
		set((s) => ({
			eventCount: s.eventCount + 1,
			firing: {
				...s.firing,
				[event.sourceId]: { at: event.at, bucket: event.bucket },
			},
			activeRipples: [...s.activeRipples, event].slice(-MAX_RECENT),
			recent: [event, ...s.recent].slice(0, MAX_RECENT),
		})),

	triggerSubscriber: (id, at, bucket) =>
		set((s) => ({ firing: { ...s.firing, [id]: { at, bucket } } })),

	tick: (now) =>
		set((s) => {
			// While paused, freeze firing/ripples — otherwise wall-clock
			// keeps marching and within a couple seconds every halo
			// expires, so resume looks like a hard restart instead of a
			// continuation.
			if (!s.playing) return s
			const nextFiring: Record<string, FiringPulse> = {}
			for (const [id, pulse] of Object.entries(s.firing)) {
				if (now - pulse.at < FIRE_HOLD_MS) nextFiring[id] = pulse
			}
			const nextRipples = s.activeRipples.filter(
				(r) => now - r.at < RIPPLE_LIFE_MS,
			)
			if (
				Object.keys(nextFiring).length === Object.keys(s.firing).length &&
				nextRipples.length === s.activeRipples.length
			) {
				return s
			}
			return { firing: nextFiring, activeRipples: nextRipples }
		}),

	setSimTime: (t) => set({ simTimeMs: t }),
	setRunDurationMs: (ms) => set({ runDurationMs: ms }),
	resetRunDuration: () => set({ runDurationMs: DEFAULT_RUN_DURATION_MS }),
	setParticipants: (participants) =>
		set({
			participants,
			participantById: new Map(participants.map((p) => [p.id, p])),
			viewBox: viewBoxFor(maxRingOf(participants)),
		}),
	resetParticipants: () =>
		set({
			participants: DEMO_PARTICIPANTS,
			participantById: new Map(DEMO_PARTICIPANTS.map((p) => [p.id, p])),
			viewBox: viewBoxFor(maxRingOf(DEMO_PARTICIPANTS)),
		}),
	applySnapshot: (snap) =>
		set({
			simTimeMs: snap.atMs,
			eventCount: snap.eventCount,
			agentState: snap.agentState,
			recent: snap.recent,
			firing: {},
			activeRipples: [],
			pausedFocus: null,
		}),

	// Backward seeks burst chronologically forward — the in-between events
	// play as eye-candy, then the destination snapshot lands and overwrites
	// lifecycle to the (earlier) target state. Reversing would require an
	// un-emit primitive that doesn't exist and reads visually as confusion.
	playBurst: (events, destSnapshot) => {
		get().cancelBurst()
		const gap = Math.max(
			SEEK_BURST_DURATION_MS / Math.max(events.length, 1),
			SEEK_BURST_MIN_GAP_MS,
		)
		for (let i = 0; i < events.length; i++) {
			const ev = events[i]
			const handle = setTimeout(() => {
				get().emit(ev)
			}, i * gap)
			burstTimers.push(handle)
		}
		const finalHandle = setTimeout(() => {
			get().applySnapshot(destSnapshot)
		}, SEEK_BURST_DURATION_MS)
		burstTimers.push(finalHandle)
	},

	cancelBurst: () => {
		for (const handle of burstTimers) clearTimeout(handle)
		burstTimers = []
	},

	setAgentStates: (states) => {
		const prev = get().agentState
		let same = Object.keys(prev).length === Object.keys(states).length
		if (same) {
			for (const k in states) {
				if (prev[k] !== states[k]) {
					same = false
					break
				}
			}
		}
		if (same) return
		set({ agentState: states })
	},

	selectAgent: (id) =>
		set((s) => ({
			selectedAgentId: id,
			pausedFocus: id === null ? s.pausedFocus : null,
		})),

	setPausedFocus: (e) => set({ pausedFocus: e }),

	setZoom: (z) => set({ zoom: clamp(z, ZOOM_MIN, ZOOM_MAX) }),
	zoomIn: () =>
		set((s) => ({ zoom: clamp(s.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
	zoomOut: () =>
		set((s) => ({ zoom: clamp(s.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
	resetZoom: () => set({ zoom: 1 }),

	setSourceMode: (mode, err = null) =>
		set({ sourceMode: mode, sourceError: err }),
	setBackendCommandSender: (fn) => set({ backendCommandSender: fn }),

	resetRun: () => {
		get().cancelBurst()
		set({
			firing: {},
			activeRipples: [],
			recent: [],
			eventCount: 0,
			simTimeMs: 0,
			selectedAgentId: null,
			pausedFocus: null,
			agentState: {},
		})
	},
}))

export { FIRE_HOLD_MS }
