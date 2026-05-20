import { useEffect, useRef } from "react"
import { useReplayClock } from "./replayClock"
import {
	RESET_DELAY_MS,
	RUN_DURATION_MS,
	RUN_SCRIPT,
	agentStateAt,
	lookupScript,
	type AgentLifeState,
} from "./runScript"
import { nextEvent, spawnEvent } from "./scriptedStream"

const MIN_EMIT_MS = 90
const MAX_EMIT_MS = 480

function computeEmitInterval(activeCount: number): number {
	if (activeCount === 0) return MAX_EMIT_MS
	return Math.max(MIN_EMIT_MS, MAX_EMIT_MS / Math.max(1, activeCount))
}

// Drives the run-time simulation against the wall clock. Reads playback flags
// directly from the store (no subscription) so the rAF loop doesn't restart
// on every state change.
export function useReplayDriver() {
	const playing = useReplayClock((s) => s.playing)
	const prevActiveRef = useRef<Set<string>>(new Set())

	// GC the firing/edges arrays regardless of playing state. With nothing being
	// emitted during pause, this drains the on-screen flashes naturally.
	useEffect(() => {
		const gc = setInterval(() => {
			useReplayClock.getState().tick(performance.now())
		}, 80)
		return () => clearInterval(gc)
	}, [])

	useEffect(() => {
		if (!playing) {
			prevActiveRef.current = new Set()
			return
		}

		let lastWall = performance.now()
		let timeUntilEmit = 200
		let frameId = 0

		const tickFrame = () => {
			const state = useReplayClock.getState()
			const wall = performance.now()
			const dt = (wall - lastWall) * state.speed
			lastWall = wall

			let nextSim = state.simTimeMs + dt
			if (nextSim > RUN_DURATION_MS + RESET_DELAY_MS) {
				state.resetRun()
				prevActiveRef.current = new Set()
				nextSim = 0
			}
			state.setSimTime(nextSim)

			// Compute lifecycle states for this frame.
			const states: Record<string, AgentLifeState> = {}
			const activeIds: string[] = []
			for (const script of RUN_SCRIPT) {
				const st = agentStateAt(script.id, nextSim)
				states[script.id] = st
				if (st === "active") activeIds.push(script.id)
			}
			state.setAgentStates(states)

			// Spawn-edge flashes: any agent that transitioned hidden→active gets a
			// spark emitted from its parent so the user sees the propagation.
			const currentActive = new Set(activeIds)
			for (const id of activeIds) {
				if (prevActiveRef.current.has(id)) continue
				if (id === "architect") continue
				const parent = lookupScript(id)?.parentId
				if (parent && currentActive.has(parent)) {
					state.emit(spawnEvent(wall, parent, id))
				}
			}
			prevActiveRef.current = currentActive

			// Steady-state event stream.
			timeUntilEmit -= dt
			if (timeUntilEmit <= 0 && activeIds.length > 0) {
				const event = nextEvent(wall, activeIds, state.selectedAgentId)
				if (event) state.emit(event)
				timeUntilEmit = computeEmitInterval(activeIds.length)
			}

			frameId = requestAnimationFrame(tickFrame)
		}

		frameId = requestAnimationFrame(tickFrame)
		return () => cancelAnimationFrame(frameId)
	}, [playing])
}
