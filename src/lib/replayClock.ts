import { create } from "zustand"
import type { ReplayEvent } from "./types"
import type { AgentLifeState } from "./runScript"

const MAX_RECENT = 60
const FIRE_HOLD_MS = 700
const EDGE_HOLD_MS = 900

export const ZOOM_MIN = 0.55
export const ZOOM_MAX = 2.4
export const ZOOM_STEP = 0.15

interface ReplayState {
	playing: boolean
	speed: number
	eventCount: number
	simTimeMs: number

	firing: Record<string, number>
	activeEdges: ReplayEvent[]
	recent: ReplayEvent[]

	agentState: Record<string, AgentLifeState>
	selectedAgentId: string | null
	pausedFocus: ReplayEvent | null
	zoom: number

	togglePlaying: () => void
	setSpeed: (s: number) => void
	emit: (e: ReplayEvent) => void
	tick: (now: number) => void

	setSimTime: (t: number) => void
	setAgentStates: (states: Record<string, AgentLifeState>) => void

	selectAgent: (id: string | null) => void
	setPausedFocus: (e: ReplayEvent | null) => void

	setZoom: (z: number) => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void

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
	activeEdges: [],
	recent: [],

	agentState: {},
	selectedAgentId: null,
	pausedFocus: null,
	zoom: 1,

	togglePlaying: () =>
		set((s) => {
			const nextPlaying = !s.playing
			// When pausing, snap focus to the most-recently emitted event (if any)
			// so the user immediately sees what was last on the wire.
			if (!nextPlaying) {
				const lastEvent = s.recent[0] ?? null
				return { playing: false, pausedFocus: lastEvent }
			}
			// Resuming clears the frozen focus.
			return { playing: true, pausedFocus: null }
		}),

	setSpeed: (speed) => set({ speed }),

	emit: (event) =>
		set((s) => ({
			eventCount: s.eventCount + 1,
			firing: {
				...s.firing,
				[event.sourceId]: event.at,
				[event.targetId]: event.at,
			},
			activeEdges: [...s.activeEdges, event].slice(-MAX_RECENT),
			recent: [event, ...s.recent].slice(0, MAX_RECENT),
		})),

	tick: (now) =>
		set((s) => {
			const nextFiring: Record<string, number> = {}
			for (const [id, at] of Object.entries(s.firing)) {
				if (now - at < FIRE_HOLD_MS) nextFiring[id] = at
			}
			const nextEdges = s.activeEdges.filter((e) => now - e.at < EDGE_HOLD_MS)
			if (
				Object.keys(nextFiring).length === Object.keys(s.firing).length &&
				nextEdges.length === s.activeEdges.length
			) {
				return s
			}
			return { firing: nextFiring, activeEdges: nextEdges }
		}),

	setSimTime: (t) => set({ simTimeMs: t }),
	setAgentStates: (states) => {
		const prev = get().agentState
		// Skip the set if states haven't changed (shallow keys check).
		// Most of the time agentState is stable across ticks.
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
			// Selecting an agent clears any frozen event focus — they're separate
			// scopes of "what am I looking at".
			pausedFocus: id === null ? s.pausedFocus : null,
		})),

	setPausedFocus: (e) => set({ pausedFocus: e }),

	setZoom: (z) => set({ zoom: clamp(z, ZOOM_MIN, ZOOM_MAX) }),
	zoomIn: () => set((s) => ({ zoom: clamp(s.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
	zoomOut: () =>
		set((s) => ({ zoom: clamp(s.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
	resetZoom: () => set({ zoom: 1 }),

	resetRun: () =>
		set({
			firing: {},
			activeEdges: [],
			recent: [],
			eventCount: 0,
			simTimeMs: 0,
			selectedAgentId: null,
			pausedFocus: null,
			agentState: {},
		}),
}))
