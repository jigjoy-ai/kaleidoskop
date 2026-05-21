import { BaseObserver } from "@mozaik-ai/core"
import type { StreamMessage } from "@mozaik-replay/shared"

/**
 * Mozaik observer instance placeholder for the replay environment.
 *
 * For now this observer is **idle** — the replay engine sinks events
 * directly to the WS rather than routing them through `env.deliver*`,
 * because the wire summary can't fully rehydrate FunctionCallItem /
 * ModelMessageItem payloads and we don't want StreamObserver
 * fabricating a second, lossier event per audit-log line.
 *
 * The class still extends BaseObserver and stays subscribed so the
 * architectural contract holds — when we add a real downstream
 * consumer that benefits from Mozaik routing (analytics replay,
 * story-clustering miner, mutation re-evaluator), we enable
 * `env.deliver*` in engine.ts and either filter duplicates here or
 * have the new consumer use its own observer.
 */
export class StreamObserver extends BaseObserver {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_sink: (msg: StreamMessage) => void) {
		super()
	}
	// All on* methods inherit no-op defaults from BaseObserver.
}
