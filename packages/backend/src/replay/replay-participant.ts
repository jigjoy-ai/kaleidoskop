import { BaseObserver } from "@mozaik-ai/core"
import type { ParticipantInfo } from "@mozaik-replay/shared"

/**
 * Stand-in participant used in replay sessions. We don't recreate the
 * original participant classes (Conductor, StoryAgent, Critic, …)
 * because their behaviour relied on side-effects we don't want to redo
 * (spawning Claude subprocesses, mutating PRD files, writing audit
 * logs, opening PRs). Instead we instantiate one of these per source
 * discovered in the audit log — same Mozaik subscribe contract, no
 * behaviour beyond identity.
 *
 * The participant is identifiable from the replay environment via its
 * `participantId` field; StreamObserver reads that to know which source
 * a given event came from.
 */
export class ReplayParticipant extends BaseObserver {
	readonly participantId: string
	readonly info: ParticipantInfo

	constructor(info: ParticipantInfo) {
		super()
		this.info = info
		this.participantId = info.id
	}

	// All on* handlers inherit no-op defaults from BaseObserver. This
	// participant doesn't react to anything; it exists to be a recognised
	// `Participant` reference for `env.deliver*(source, …)` calls.

	get [Symbol.toStringTag](): string {
		return `ReplayParticipant(${this.info.id})`
	}
}
