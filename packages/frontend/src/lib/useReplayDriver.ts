import { useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
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
import { layoutFor } from "./hexLayout"
import type { PixelCoord } from "./types"

const MIN_EMIT_MS = 90
const MAX_EMIT_MS = 480

function computeEmitInterval(activeCount: number): number {
	if (activeCount === 0) return MAX_EMIT_MS
	return Math.max(MIN_EMIT_MS, MAX_EMIT_MS / Math.max(1, activeCount))
}

// Position + distance caches keyed by participant id. Lazily filled from
// the current store's participant set — live runs with > 10 stories use
// ring 3 / 4 slots that the static DEMO_PARTICIPANTS roster wouldn't
// cover. Cleared by `resetPositionCache()` whenever the store's
// participants object identity changes.
const POSITIONS = new Map<string, PixelCoord>()
const DISTANCE_CACHE = new Map<string, number>()
let cachedParticipantsRef: object | null = null

function positionOf(id: string): PixelCoord | undefined {
	const participants = useReplayClock.getState().participants
	if (participants !== cachedParticipantsRef) {
		POSITIONS.clear()
		DISTANCE_CACHE.clear()
		cachedParticipantsRef = participants
	}
	const cached = POSITIONS.get(id)
	if (cached) return cached
	const p = useReplayClock.getState().participantById.get(id)
	if (!p) return undefined
	const pos = layoutFor(p.ring, p.ringIndex)
	POSITIONS.set(id, pos)
	return pos
}

function distance(a: string, b: string): number {
	if (a === b) return 0
	const key = a < b ? `${a}|${b}` : `${b}|${a}`
	let d = DISTANCE_CACHE.get(key)
	if (d !== undefined) return d
	const pa = positionOf(a)
	const pb = positionOf(b)
	if (!pa || !pb) return 0
	d = Math.hypot(pa.x - pb.x, pa.y - pb.y)
	DISTANCE_CACHE.set(key, d)
	return d
}

export function useReplayDriver() {
	const playing = useReplayClock((s) => s.playing)
	// When the URL points at a specific run (`/r/:id`), suppress the
	// scripted demo so the page is a clean slate awaiting the user's
	// "connect" click. Otherwise (`/`) the scripted run loops as before.
	const params = useParams<{ id?: string }>()
	const onRunPage = !!params.id
	const prevActiveRef = useRef<Set<string>>(new Set())
	const triggeredRef = useRef<Map<string, Set<string>>>(new Map())

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
			const live =
				state.sourceMode === "live" ||
				state.sourceMode === "connecting" ||
				state.sourceMode === "finished"
			// Demo emissions also pause when the URL is on `/r/:id` — the
			// page belongs to a specific real run, no scripted noise.
			const demoSuppressed = live || onRunPage

			// Demo-mode scripted run owns the simTime + agent lifecycle.
			// In live mode (or on a run page) the WS client owns those —
			// the frame loop here only handles ripple → subscriber pacing
			// and stale-state GC.
			if (!demoSuppressed) {
				if (nextSim > RUN_DURATION_MS + RESET_DELAY_MS) {
					state.resetRun()
					prevActiveRef.current = new Set()
					triggeredRef.current.clear()
					nextSim = 0
				}
				state.setSimTime(nextSim)

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
			}

			// Ripple → subscriber pacing. As the front-edge of the ripple expands
			// from the source at RIPPLE_SPEED_PX_PER_SEC, each subscriber lights
			// up at the moment the wave reaches its centre.
			const ripples = state.activeRipples
			const agentStates = state.agentState
			for (const ripple of ripples) {
				let triggered = triggeredRef.current.get(ripple.id)
				if (!triggered) {
					triggered = new Set([ripple.sourceId])
					triggeredRef.current.set(ripple.id, triggered)
				}
				for (const subId of ripple.subscriberIds) {
					if (triggered.has(subId)) continue
					const lifeState = agentStates[subId]
					if (!lifeState || lifeState === "hidden") continue
					const dist = distance(ripple.sourceId, subId)
					const delayMs = (dist / RIPPLE_SPEED_PX_PER_SEC) * 1000
					if (wall - ripple.at >= delayMs) {
						triggered.add(subId)
						state.triggerSubscriber(subId, wall, ripple.bucket)
					}
				}
			}

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
	}, [playing, onRunPage])
}
