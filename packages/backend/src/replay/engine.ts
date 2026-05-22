import { AgenticEnvironment } from "@mozaik-ai/core"
import type {
	AgentLifeState,
	ParticipantInfo,
	ReplayEvent,
	ReplayStateSnapshot,
	StreamCommand,
	StreamMessage,
} from "@kaleidoskop/shared"

import { ReplayParticipant } from "./replay-participant.js"
import { StreamObserver } from "./stream-observer.js"

const SEEK_BURST_THRESHOLD_MS = 3000
const SEEK_BURST_MAX_EVENTS = 200

export interface ReplaySessionOptions {
	participants: ParticipantInfo[]
	events: ReplayEvent[]
	durationMs: number
	/**
	 * Where every captured Mozaik event goes. Typically a WebSocket
	 * send wrapper (`(msg) => socket.send(JSON.stringify(msg))`).
	 */
	sink: (msg: StreamMessage) => void
	/**
	 * Wall-clock time scaling. 1× = run replays at original pace. 10× =
	 * one minute of original takes 6 seconds. Default: 10 (replay feels
	 * lively without being unwatchable).
	 */
	speed?: number
}

/**
 * In-memory replay session — owns one fresh Mozaik AgenticEnvironment,
 * one ReplayParticipant per discovered source, one StreamObserver
 * subscribed to forward everything to the sink, and a setTimeout-driven
 * scheduler that dispatches the recorded events through the environment
 * at the configured speed.
 *
 * Lifecycle: construct → play() → pause() / seek() / setSpeed() / stop().
 * stop() is idempotent and detaches all participants from the env so a
 * dropped WebSocket doesn't leak a long-running scheduler.
 */
export class ReplaySession {
	private readonly env = new AgenticEnvironment()
	private readonly participantsById = new Map<string, ReplayParticipant>()
	private readonly observer: StreamObserver
	private readonly events: ReplayEvent[]
	private readonly sink: (msg: StreamMessage) => void

	private speed: number
	private playing = false
	/** Simulated playback clock (ms). Always within [0, durationMs]. */
	private simMs = 0
	/** Next event index to dispatch. */
	private cursor = 0
	private wallStartedAt = 0
	private wallSimAtStart = 0
	private timer: ReturnType<typeof setTimeout> | null = null
	private stopped = false

	constructor(opts: ReplaySessionOptions) {
		this.events = opts.events
		this.sink = opts.sink
		this.speed = opts.speed ?? 10

		for (const info of opts.participants) {
			const p = new ReplayParticipant(info)
			p.join(this.env)
			this.participantsById.set(info.id, p)
		}

		this.observer = new StreamObserver(this.sink)
		this.observer.join(this.env)
	}

	/**
	 * Push the `hello` envelope that the frontend uses to seed its
	 * layout (participant slots) and metadata. Safe to call once per
	 * session at WS-connection time.
	 */
	sendHello(runId: string, createdAt: string, durationMs: number): void {
		const meta = {
			id: runId,
			createdAt,
			durationMs,
			participantCount: this.participantsById.size,
			storyCount: [...this.participantsById.values()].filter(
				(p) => p.info.role === "story",
			).length,
			eventCount: this.events.length,
		}
		this.sink({
			kind: "hello",
			meta,
			participants: [...this.participantsById.values()].map((p) => p.info),
		})
	}

	play(): void {
		if (this.playing || this.stopped) return
		this.playing = true
		this.wallStartedAt = Date.now()
		this.wallSimAtStart = this.simMs
		this.scheduleNext()
	}

	pause(): void {
		if (!this.playing) return
		// Capture simMs at pause-time so the next play() resumes from here.
		this.simMs = this.currentSimMs()
		this.playing = false
		if (this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
		}
	}

	setSpeed(speed: number): void {
		if (speed <= 0) return
		// Re-anchor the wall-clock reference so the speed change takes
		// effect from "now" instead of warping past time.
		this.simMs = this.currentSimMs()
		this.speed = speed
		this.wallStartedAt = Date.now()
		this.wallSimAtStart = this.simMs
		if (this.playing && this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
			this.scheduleNext()
		}
	}

	seek(toMs: number): void {
		// Move cursor to first event with at >= target, reset clock, and
		// emit a state snapshot covering everything before that point.
		// The frontend uses the snapshot to restore agentState +
		// recent-events list to "what would be visible at this moment",
		// then resumes streaming from the cursor.
		const fromMs = this.currentSimMs()
		const target = Math.max(0, Math.floor(toMs))
		this.simMs = target
		this.cursor = 0
		while (
			this.cursor < this.events.length &&
			this.events[this.cursor]!.at < target
		) {
			this.cursor++
		}
		this.wallStartedAt = Date.now()
		this.wallSimAtStart = this.simMs
		const snapshot = this.computeSnapshot(target)
		if (Math.abs(target - fromMs) <= SEEK_BURST_THRESHOLD_MS) {
			this.sink({
				kind: "snapshot",
				snapshot,
			})
		} else {
			const range = this.seekBurstRange(fromMs, target)
			const events = this.sampleSeekBurstEvents(range)
			this.sink({
				kind: "seek_burst",
				burst: {
					fromMs,
					toMs: target,
					direction: target >= fromMs ? "forward" : "backward",
					events,
					truncated: range.length > SEEK_BURST_MAX_EVENTS,
					snapshot,
				},
			})
		}
		if (this.playing && this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
			this.scheduleNext()
		}
	}

	private seekBurstRange(fromMs: number, target: number): ReplayEvent[] {
		const range =
			target >= fromMs
				? this.events.filter((event) => event.at > fromMs && event.at <= target)
				: this.events.filter((event) => event.at >= target && event.at < fromMs)
		// Backward seeks still animate skipped events chronologically forward:
		// the ripple pipeline is directional by source/subscribers, not by
		// time reversal, and the destination snapshot is applied afterward.
		return range.sort((a, b) => a.at - b.at)
	}

	private sampleSeekBurstEvents(range: ReplayEvent[]): ReplayEvent[] {
		if (range.length <= SEEK_BURST_MAX_EVENTS) return range
		const sampled: ReplayEvent[] = []
		const seen = new Set<string>()
		for (let i = 0; i < SEEK_BURST_MAX_EVENTS; i++) {
			const event = range[Math.floor((i * range.length) / SEEK_BURST_MAX_EVENTS)]!
			if (seen.has(event.id)) continue
			seen.add(event.id)
			sampled.push(event)
		}
		return sampled
	}

	/**
	 * Walk every event with at <= target and accumulate the lifecycle
	 * state + recent-events list that the frontend should display at
	 * that moment. Pure function over `this.events` — doesn't mutate
	 * cursor / simMs / playing flags.
	 */
	private computeSnapshot(target: number): ReplayStateSnapshot {
		const agentState: Record<string, AgentLifeState> = {}
		const recent: ReplayEvent[] = []
		let eventCount = 0
		for (const event of this.events) {
			if (event.at > target) break
			eventCount++
			recent.push(event)
			const cur = agentState[event.sourceId]
			if (event.domain === "agent_state") {
				const phase = (event.data?.["phase"] ?? "") as string
				if (phase === "done" || phase === "failed" || phase === "aborted") {
					agentState[event.sourceId] = "completed"
				} else if (cur !== "completed") {
					agentState[event.sourceId] = "active"
				}
			} else if (event.domain === "story_result") {
				agentState[event.sourceId] = "completed"
			} else if (cur !== "completed") {
				agentState[event.sourceId] = "active"
			}
		}
		// Cap at the same 60-event window the frontend tracks; newest-first
		// so the inspector sidebar matches what live streaming produces.
		const tail = recent.slice(-60).reverse()
		return { atMs: target, eventCount, agentState, recent: tail }
	}

	stop(): void {
		if (this.stopped) return
		this.stopped = true
		this.playing = false
		if (this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
		}
		for (const p of this.participantsById.values()) p.leave(this.env)
		this.observer.leave(this.env)
	}

	applyCommand(cmd: StreamCommand): void {
		switch (cmd.kind) {
			case "play":
				this.play()
				return
			case "pause":
				this.pause()
				return
			case "seek":
				this.seek(cmd.toMs)
				return
			case "set_speed":
				this.setSpeed(cmd.speed)
				return
		}
	}

	private currentSimMs(): number {
		if (!this.playing) return this.simMs
		const elapsed = (Date.now() - this.wallStartedAt) * this.speed
		return this.wallSimAtStart + elapsed
	}

	private scheduleNext(): void {
		if (!this.playing || this.stopped) return
		if (this.cursor >= this.events.length) {
			this.sink({ kind: "done" })
			this.playing = false
			return
		}
		const event = this.events[this.cursor]!
		const sim = this.currentSimMs()
		const wallDelayMs = Math.max(0, (event.at - sim) / this.speed)
		this.timer = setTimeout(() => {
			this.timer = null
			if (!this.playing || this.stopped) return
			this.dispatch(event)
			this.cursor++
			this.scheduleNext()
		}, wallDelayMs)
	}

	/**
	 * Forward one recorded ReplayEvent through the WS sink.
	 *
	 * Architecture note: the Mozaik AgenticEnvironment + ReplayParticipant
	 * set is in place but we're intentionally **not** routing the
	 * recorded events through `env.deliver*` yet. Doing so would force
	 * StreamObserver to forward a second event with a fresh wall-clock
	 * timestamp and a partially-rehydrated payload (the wire summary
	 * doesn't carry the full original args / output / etc.), which the
	 * frontend would receive as a duplicate of the real event.
	 *
	 * Once we add real downstream observers in the replay env (story-
	 * clustering analyzer, mutation re-evaluator, …), we re-enable
	 * `env.deliver*` calls here and have StreamObserver stop forwarding
	 * (or dedupe by event id). For now: clean direct sink, single event
	 * per audit-log line, full original wire data preserved.
	 */
	private dispatch(event: ReplayEvent): void {
		this.sink({ kind: "event", event })
	}
}
