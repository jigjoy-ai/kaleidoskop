import {
	AgenticEnvironment,
	FunctionCallItem,
	SemanticEvent,
} from "@mozaik-ai/core"
import type {
	ParticipantInfo,
	ReplayEvent,
	StreamCommand,
	StreamMessage,
} from "@mozaik-replay/shared"

import { ReplayParticipant } from "./replay-participant.js"
import { StreamObserver } from "./stream-observer.js"

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
		// Naive seek: rewind cursor to first event with at >= target,
		// reset clock. Doesn't replay missed events — events that haven't
		// fired yet wait for the new clock to reach them.
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
		if (this.playing && this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
			this.scheduleNext()
		}
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
	 * Convert a recorded ReplayEvent back into a Mozaik item and push it
	 * through the live env. The observer subscribed on the env will pick
	 * it up via `onExternalEvent` / `onExternalFunctionCall` / … and
	 * forward through the sink — same path real participants would take.
	 */
	private dispatch(event: ReplayEvent): void {
		const source = this.participantsById.get(event.sourceId)
		if (!source) {
			// Source wasn't discovered (e.g. plugin metadata that the
			// parser stripped). Forward the event payload-style so the
			// frontend still sees it, but skip the env round-trip.
			this.sink({ kind: "event", event })
			return
		}

		switch (event.domain) {
			case "function_call":
				this.env.deliverFunctionCall(
					source,
					FunctionCallItem.rehydrate({
						callId: typeof event.payload === "string" ? event.payload : "",
						name: "",
						args: "",
					}),
				)
				// The rehydrate path above can't reconstruct the full
				// FunctionCallItem from our wire summary alone. To keep
				// the frontend in sync, also forward the original event
				// directly — the observer will get a duplicate but the
				// frontend dedupes on `event.id`.
				this.sink({ kind: "event", event })
				return
			case "function_call_output":
			case "reasoning":
			case "model_message":
				// Same situation — wire shape lacks the full Mozaik item
				// payload. For now, forward the event directly. A future
				// pass can carry the raw item JSON on the wire so we
				// genuinely round-trip through Mozaik's typed channels.
				this.sink({ kind: "event", event })
				return
			default:
				// Custom typed event — wrap as SemanticEvent and let
				// Mozaik fan-out for real.
				this.env.deliverSemanticEvent(
					source,
					new SemanticEvent(event.domain, {
						bucket: event.bucket,
						payload: event.payload,
					}),
				)
				this.sink({ kind: "event", event })
				return
		}
	}
}
