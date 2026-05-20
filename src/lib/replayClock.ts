import { create } from "zustand"
import type { ReplayEvent } from "./types"

const MAX_RECENT = 40
const FIRE_HOLD_MS = 700
const EDGE_HOLD_MS = 900

interface ReplayState {
	playing: boolean
	speed: number
	eventCount: number
	firing: Record<string, number>
	activeEdges: ReplayEvent[]
	recent: ReplayEvent[]
	selected: ReplayEvent | null

	togglePlaying: () => void
	setSpeed: (s: number) => void
	emit: (e: ReplayEvent) => void
	tick: (now: number) => void
	select: (e: ReplayEvent | null) => void
	reset: () => void
}

export const useReplayClock = create<ReplayState>((set) => ({
	playing: true,
	speed: 1,
	eventCount: 0,
	firing: {},
	activeEdges: [],
	recent: [],
	selected: null,

	togglePlaying: () => set((s) => ({ playing: !s.playing })),
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
	select: (selected) => set({ selected }),
	reset: () =>
		set({
			firing: {},
			activeEdges: [],
			recent: [],
			eventCount: 0,
			selected: null,
		}),
}))

export const FIRE_HOLD_MS_EXPORT = FIRE_HOLD_MS
export const EDGE_HOLD_MS_EXPORT = EDGE_HOLD_MS
