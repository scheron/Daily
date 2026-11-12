import type {AgentSessionState, TaskWorkflowCommand} from "../types/taskWorkflow"

export const AGENT_SESSION_STATES: AgentSessionState[] = ["working", "waiting", "finished", "error"]

export const TASK_WORKFLOW_LEGACY_STAGES: Extract<TaskWorkflowCommand, {stage: string}>["stage"][] = ["planning", "implementation", "ready_to_merge"]

export const MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS = 1800
