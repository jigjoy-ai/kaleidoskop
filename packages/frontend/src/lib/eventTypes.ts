import type { DomainEvent, EventBucket } from "./types"

// 9 visual buckets. Multiple semantic events can share a bucket — colour
// distinguishes the *kind* of activity (a story emitting tool calls vs the
// conductor announcing a level), not every wire shape.
export const BUCKET_COLOR: Record<EventBucket, string> = {
	lifecycle: "#7fd97f",
	spawn: "#b97bff",
	tool_call: "#ffa86c",
	reasoning: "#5dd6e8",
	verdict: "#f5c95c",
	knowledge: "#7faaf5",
	replan: "#ff7fc9",
	message: "#a8a8d8",
	error: "#f87f7f",
}

export const BUCKET_LABEL: Record<EventBucket, string> = {
	lifecycle: "lifecycle",
	spawn: "spawn",
	tool_call: "tool call",
	reasoning: "reasoning",
	verdict: "verdict",
	knowledge: "knowledge",
	replan: "replan",
	message: "message",
	error: "error",
}

export const BUCKETS: readonly EventBucket[] = Object.keys(
	BUCKET_COLOR,
) as readonly EventBucket[]

// Map every domain event to its visual bucket. Includes the extra LLM/CLI
// passthrough types that show up in real baro audit logs but aren't part of
// the BusEvent taxonomy.
export const BUCKET_OF: Record<DomainEvent, EventBucket> = {
	agent_state: "lifecycle",
	story_spawn_request: "spawn",
	story_spawned: "spawn",
	level_started: "lifecycle",
	level_completed: "lifecycle",
	level_compute_request: "lifecycle",
	run_start_request: "lifecycle",
	run_started: "lifecycle",
	run_completed: "lifecycle",
	function_call: "tool_call",
	function_call_output: "tool_call",
	reasoning: "reasoning",
	model_message: "reasoning",
	agent_result: "verdict",
	story_result: "verdict",
	critique: "verdict",
	knowledge: "knowledge",
	replan: "replan",
	coordination: "replan",
	agent_targeted_message: "message",
	agent_user_message: "message",
	conductor_state: "lifecycle",
	claude_system: "lifecycle",
	claude_rate_limit: "lifecycle",
	claude_stream_chunk: "reasoning",
	claude_unknown_event: "lifecycle",
	codex_system: "lifecycle",
	codex_turn_event: "lifecycle",
	codex_item_event: "reasoning",
	finalize_started: "lifecycle",
	pr_created: "lifecycle",
	error: "error",
	unknown: "lifecycle",
}

export const DOMAIN_LABEL: Record<DomainEvent, string> = {
	agent_state: "AgentStateItem",
	story_spawn_request: "StorySpawnRequestItem",
	story_spawned: "StorySpawnedItem",
	level_started: "LevelStartedItem",
	level_completed: "LevelCompletedItem",
	level_compute_request: "LevelComputeRequestItem",
	run_start_request: "RunStartRequestItem",
	run_started: "RunStartedItem",
	run_completed: "RunCompletedItem",
	function_call: "FunctionCallItem",
	function_call_output: "FunctionCallOutputItem",
	reasoning: "ReasoningItem",
	model_message: "ModelMessageItem",
	agent_result: "AgentResultItem",
	story_result: "StoryResultItem",
	critique: "CritiqueItem",
	knowledge: "KnowledgeItem",
	replan: "ReplanItem",
	coordination: "CoordinationItem",
	agent_targeted_message: "AgentTargetedMessageItem",
	agent_user_message: "AgentUserMessageItem",
	conductor_state: "ConductorStateItem",
	claude_system: "ClaudeSystemItem",
	claude_rate_limit: "ClaudeRateLimitItem",
	claude_stream_chunk: "ClaudeStreamChunkItem",
	claude_unknown_event: "ClaudeUnknownEventItem",
	codex_system: "CodexSystemItem",
	codex_turn_event: "CodexTurnEventItem",
	codex_item_event: "CodexItemEventItem",
	finalize_started: "FinalizeStartedItem",
	pr_created: "PrCreatedItem",
	error: "ErrorItem",
	unknown: "Unknown",
}
