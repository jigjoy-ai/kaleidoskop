import { useEffect, useRef } from "react"
import {
	RIPPLE_SPEED_PX_PER_SEC,
	useReplayClock,
} from "./replayClock"
import {
	RESET_DELAY_MS,
	RUN_DURATION_MS,
	RUN_SCRIPT,
	agentStateAt,
	lookupScript,
} from "./runScript"
import { nextEvent, spawnEvent } from "./scriptedStream"
import { computeForceLayout } from "./forceLayout"

const MIN_EMIT_MS = 90
const MAX_EMIT_MS = 480

function computeEmitInterval(activeCount: number): number {
	if (activeCount === 0) return MAX_EMIT_MS
	return Math.max(MIN_EMIT_MS, MAX_EMIT_MS / Math.max(1, activeCount))
}

export function useReplayDriver() {
	const playing = useReplayClock((s) => s.playing)
	const prevActiveRef = useRef<Set<string>>(new Set())
	const triggeredRef = useRef<Map<string, Set<string>>>(new Map())

	// Cache distances between all participant pairs once layout converges.
	const distancesRef = useRef<Map<string, number> | null>(null)
	if (!distancesRef.current) {
		const layout = computeForceLayout()
		const cache = new Map<string, number>()
		const ids = [...layout.positions.keys()]
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const a = ids[i]
				const b = ids[j]
				const pa = layout.positions.get(a)!
				const pb = layout.positions.get(b)!
				const d = Math.hypot(pa.x - pb.x, pa.y - pb.y)
				const key = a < b ? `${a}|${b}` : `${b}|${a}`
				cache.set(key, d)
			}
		}
		distancesRef.current = cache
	}

	function getDistance(a: string, b: string): number {
		if (a === b) return 0
		const key = a < b ? `${a}|${b}` : `${b}|${a}`
		return distancesRef.current!.get(key) ?? 0
	}

	// GC firing/ripples regardless of playing state.
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
				triggeredRef.current.clear()
				nextSim = 0
			}
			state.setSimTime(nextSim)

			// Lifecycle states for this frame.
			const states: Record<string, "hidden" | "active" | "completed"> = {}
			const activeIds: string[] = []
			for (const script of RUN_SCRIPT) {
				const st = agentStateAt(script.id, nextSim)
				states[script.id] = st
				if (st === "active") activeIds.push(script.id)
			}
			state.setAgentStates(states)

			// Spawn ripples for newly-active participants.
			const currentActive = new Set(activeIds)
			for (const id of activeIds) {
				if (prevActiveRef.current.has(id)) continue
				if (id === "conductor") continue
				const parent = lookupScript(id)?.parentId
				if (parent && currentActive.has(parent)) {
					state.emit(spawnEvent(wall, parent, id))
				}
			}
			prevActiveRef.current = currentActive

			// Steady-state events.
			timeUntilEmit -= dt
			if (timeUntilEmit <= 0 && activeIds.length > 0) {
				const event = nextEvent(wall, activeIds, state.selectedAgentId)
				if (event) state.emit(event)
				timeUntilEmit = computeEmitInterval(activeIds.length)
			}

			// Ripple propagation — trigger each subscriber when the ripple's
			// expanding front-edge reaches them.
			const ripples = state.activeRipples
			for (const ripple of ripples) {
				let triggered = triggeredRef.current.get(ripple.id)
				if (!triggered) {
					triggered = new Set([ripple.sourceId])
					triggeredRef.current.set(ripple.id, triggered)
				}
				for (const subId of ripple.subscriberIds) {
					if (triggered.has(subId)) continue
					if (!states[subId] || states[subId] === "hidden") continue
					const dist = getDistance(ripple.sourceId, subId)
					const delayMs = (dist / RIPPLE_SPEED_PX_PER_SEC) * 1000
					if (wall - ripple.at >= delayMs) {
						triggered.add(subId)
						state.triggerSubscriber(subId, wall, ripple.bucket)
					}
				}
			}

			// Drain stale triggered entries when the map grows.
			if (triggeredRef.current.size > 80) {
				const activeRippleIds = new Set(ripples.map((r) => r.id))
				for (const key of triggeredRef.current.keys()) {
					if (!activeRippleIds.has(key)) triggeredRef.current.delete(key)
				}
			}

			frameId = requestAnimationFrame(tickFrame)
		}

		frameId = requestAnimationFrame(tickFrame)
		return () => cancelAnimationFrame(frameId)
	}, [playing])
}
