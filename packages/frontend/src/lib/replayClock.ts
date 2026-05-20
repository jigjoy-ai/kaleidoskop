import { create } from "zustand"
import type { EventBucket, FiringPulse, ReplayEvent } from "./types"
import type { AgentLifeState } from "./runScript"

const MAX_RECENT = 60
const FIRE_HOLD_MS = 700
const RIPPLE_LIFE_MS = 1300

export const ZOOM_MIN = 0.55
export const ZOOM_MAX = 2.4
export const ZOOM_STEP = 0.15

export const RIPPLE_SPEED_PX_PER_SEC = 760
export const RIPPLE_MAX_RADIUS = 360
export const RIPPLE_VISUAL_DURATION_MS = 700

export type SourceMode = "demo" | "live" | "connecting" | "error"

interface ReplayState {
	playing: boolean
	speed: number
	eventCount: number
	simTimeMs: number

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

	togglePlaying: () => void
	setSpeed: (s: number) => void
	emit: (e: ReplayEvent) => void
	triggerSubscriber: (id: string, at: number, bucket: EventBucket) => void
	tick: (now: number) => void

	setSimTime: (t: number) => void
	setAgentStates: (states: Record<string, AgentLifeState>) => void

	selectAgent: (id: string | null) => void
	setPausedFocus: (e: ReplayEvent | null) => void

	setZoom: (z: number) => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void

	setSourceMode: (mode: SourceMode, err?: string | null) => void

	resetRun: () => void
}

const clamp = (v: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, v))

export const useReplayClock = create<ReplayState>((set, get) => ({
	playing: true,
	speed: 1,
	eventCount: 0,
	simTimeMs: 0,

	firing: {},
	activeRipples: [],
	recent: [],

	agentState: {},
	selectedAgentId: null,
	pausedFocus: null,
	zoom: 1,

	sourceMode: "demo",
	sourceError: null,

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

	resetRun: () =>
		set({
			firing: {},
			activeRipples: [],
			recent: [],
			eventCount: 0,
			simTimeMs: 0,
			selectedAgentId: null,
			pausedFocus: null,
			agentState: {},
		}),
}))

export { FIRE_HOLD_MS }
