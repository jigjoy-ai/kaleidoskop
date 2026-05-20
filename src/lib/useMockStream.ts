import { useEffect } from "react"
import { generateEvent } from "./mockEventStream"
import { useReplayClock } from "./replayClock"

const BASE_INTERVAL_MS = 380

// Drive both: a periodic event emitter (when playing) and a periodic GC tick
// that expires firing nodes / active edges past their hold window. The GC runs
// regardless of playing state so pause-then-resume doesn't leave stale state.
export function useMockStream() {
	const playing = useReplayClock((s) => s.playing)
	const speed = useReplayClock((s) => s.speed)
	const emit = useReplayClock((s) => s.emit)
	const tick = useReplayClock((s) => s.tick)

	useEffect(() => {
		const gc = setInterval(() => tick(performance.now()), 80)
		return () => clearInterval(gc)
	}, [tick])

	useEffect(() => {
		if (!playing) return
		const interval = BASE_INTERVAL_MS / speed
		const id = setInterval(() => {
			emit(generateEvent(performance.now()))
		}, interval)
		return () => clearInterval(id)
	}, [playing, speed, emit])
}
