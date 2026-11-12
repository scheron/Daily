import type {ActorSource, Task, TaskStatus} from "./storage"

export type TaskPlanningChanges = Partial<
  Pick<Task, "scheduled" | "status" | "estimatedTime" | "priority" | "content" | "branchId" | "milestoneId" | "tags" | "orderIndex" | "deletedAt">
>

export type AgentSessionState = "working" | "waiting" | "finished" | "error"

export type TaskWorkflowCommand = {
  taskId: string
  operationId: string
  expectedRevision: string
} & (
  | {kind: "transition"; status: TaskStatus}
  | {kind: "transition"; stage: "planning" | "implementation" | "ready_to_merge"}
  | {kind: "session_start"; sessionId: string; summary?: string}
  | {kind: "session_update"; sessionId: string; state: AgentSessionState; summary?: string}
  | {kind: "start" | "heartbeat" | "pause"; sessionId: string}
  | {kind: "propose"; changes: TaskPlanningChanges; reason: string}
)

export type TaskWorkflowResolution = {
  taskId: string
  proposalId: string
  decision: "accepted" | "rejected"
  operationId: string
  expectedRevision: string
}

export type TaskWorkflowLegacyTransition = Extract<TaskWorkflowCommand, {stage: string}>

export type TaskWorkflowRecordedCommand = TaskWorkflowCommand | (TaskWorkflowResolution & {kind: "resolve"})

export type TaskWorkflowContext = {actorId: string; source: ActorSource}

export type TaskWorkflowReceipt = {
  operationId: string
  taskId: string
  revision: string
  kind: TaskWorkflowRecordedCommand["kind"]
  recordId: string
  confirmedSeconds: number
  outcome?: "applied" | "proposal_pending"
  proposalId?: string | null
}

export type TaskWorkflowRecord = {
  schema?: 2 | 3
  id: string
  taskId: string
  actorId: string
  source: ActorSource
  runtimeId: string
  checkpointMonotonic: number | null
  proposalCommentId: string | null
  command: TaskWorkflowRecordedCommand
  originalValues?: TaskPlanningChanges | null
  effectiveChanges?: TaskPlanningChanges | null
  sessionId?: string | null
  sessionState?: AgentSessionState | null
  canonicalRequest: string
  createdAt: number
  sequence: number
  taskGeneration: string
  interval: {from: number; to: number} | null
  receipt: TaskWorkflowReceipt
}

export type TaskWorkflowSession = {
  sessionId: string
  actorId: string
  runtimeId: string
  state: AgentSessionState
  summary: string | null
  startedAt: number
  updatedAt: number
  connection: "connected" | "uncertain" | "interrupted"
  checkpointAt: number
  expiresAt: number
  expired: boolean
}

export type TaskWorkflowProposal = {
  id: string
  commentId: string | null
  actorId: string
  changes: TaskPlanningChanges
  originalValues: TaskPlanningChanges
  reason: string
  status: "pending" | "accepted" | "rejected"
  resolutionRecordId: string | null
  conflict: boolean
}

export type WorkflowGuidanceScope = {kind: "workspace"} | {kind: "project"; projectId: string}

export type WorkflowGuidanceUpdate = {
  scope: WorkflowGuidanceScope
  content: string
  allowCompletion: boolean | null
  operationId: string
  expectedRevision: string
}

export type WorkflowGuidanceRecord = WorkflowGuidanceUpdate & {
  id: string
  createdAt: number
  sequence: number
}

export type WorkflowGuidanceDocument = {
  scope: WorkflowGuidanceScope
  content: string
  allowCompletion: boolean | null
  revision: string
  history: WorkflowGuidanceRecord[]
}

export type WorkflowGuidance = {
  workspace: WorkflowGuidanceDocument
  project: WorkflowGuidanceDocument | null
  allowCompletion: boolean
  timePolicy: {maxObservedIntervalSeconds: number; requiresHeartbeat: false}
}

export type TaskWorkflowState = {
  task: Task
  revision: string
  records: TaskWorkflowRecord[]
  activeSessions: TaskWorkflowSession[]
  sessions: TaskWorkflowSession[]
  proposals: TaskWorkflowProposal[]
  confirmedSeconds: number
  guidance: WorkflowGuidance
}
