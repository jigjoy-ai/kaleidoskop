import type { ParticipantInfo, ParticipantRole } from "@kaleidoskop/shared"

/**
 * Parse the `source` field of an audit-log line into a normalised
 * participant. The audit log writes source as `ClassName` for singleton
 * participants (Conductor, Operator, …) or `ClassName:agentId` for
 * per-story participants (StoryAgent, ClaudeCliParticipant, …).
 *
 * Cases observed in real baro audit logs:
 *   - `Conductor`              → conductor singleton
 *   - `Operator`               → operator
 *   - `StoryFactory`           → story-factory
 *   - `Critic` / `critic`      → critic (case-folded)
 *   - `Surgeon` / `surgeon`    → surgeon
 *   - `Librarian` / `librarian`→ librarian
 *   - `Sentry`                 → sentry
 *   - `Auditor`                → auditor
 *   - `Finalizer`              → finalizer
 *   - `StoryAgent:S1`              → story-S1
 *   - `CodexStoryAgent:S1`         → story-S1 (Codex execution backend)
 *   - `OpenAIStoryAgent:S1`        → story-S1 (OpenAI-compatible backend: DeepSeek, etc.)
 *   - `_ClaudeCliParticipant:S1`   → story-S1 (collapses with its parent StoryAgent)
 *   - `_CodexCliParticipant:S1`    → story-S1 (Codex CLI subprocess wrapper)
 *   - anything else with `:agentId` suffix → unknown:agentId
 *   - bare class names we don't recognise → bare slug
 */

const SINGLETON_ROLE: Record<string, ParticipantRole> = {
	conductor: "conductor",
	operator: "driver",
	storyfactory: "driver",
	"story-factory": "driver",
	critic: "observer",
	surgeon: "observer",
	librarian: "observer",
	sentry: "observer",
	auditor: "observer",
	finalizer: "observer",
}

const SINGLETON_LABEL: Record<string, string> = {
	conductor: "Conductor",
	operator: "Operator",
	storyfactory: "StoryFactory",
	"story-factory": "StoryFactory",
	critic: "Critic",
	surgeon: "Surgeon",
	librarian: "Librarian",
	sentry: "Sentry",
	auditor: "Auditor",
	finalizer: "Finalizer",
}

/**
 * A source class denotes a per-story participant. baro names these by
 * execution backend — `StoryAgent`, `CodexStoryAgent`, `OpenAIStoryAgent` —
 * each optionally paired with a CLI child participant (`_ClaudeCliParticipant`,
 * `_CodexCliParticipant`). Match by suffix so new backends (e.g. a future
 * `GeminiStoryAgent`) are picked up without touching this file.
 */
function isStoryClass(cls: string): boolean {
	return cls.endsWith("storyagent") || cls.endsWith("cliparticipant")
}

export interface ParsedSource extends ParticipantInfo {
	raw: string
}

export function parseSource(raw: string): ParsedSource {
	const colonIndex = raw.indexOf(":")
	if (colonIndex >= 0) {
		const cls = raw.slice(0, colonIndex).toLowerCase()
		const agentId = raw.slice(colonIndex + 1)
		if (isStoryClass(cls)) {
			return {
				id: `story-${agentId}`,
				label: agentId,
				role: "story",
				raw,
			}
		}
		return {
			id: `unknown-${slug(raw)}`,
			label: raw,
			role: "observer",
			raw,
		}
	}

	const key = raw.toLowerCase()
	if (key in SINGLETON_ROLE) {
		return {
			id: key === "storyfactory" ? "story-factory" : key,
			label: SINGLETON_LABEL[key] ?? raw,
			role: SINGLETON_ROLE[key]!,
			raw,
		}
	}

	return {
		id: `unknown-${slug(raw)}`,
		label: raw,
		role: "observer",
		raw,
	}
}

function slug(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
