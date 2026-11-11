import type {ActorSource, Task} from "./storage"

export type TaskWorkflowCommand = {
  taskId: string
  operationId: string
  expectedRevision: string
} & (
  | {kind: "transition"; stage: "planning" | "implementation" | "ready_to_merge"}
  | {kind: "start" | "heartbeat" | "pause"; sessionId: string}
  | {kind: "propose"; changes: Partial<Pick<Task, "scheduled" | "estimatedTime" | "priority">>; reason: string}
)

export type TaskWorkflowContext = {actorId: string; source: ActorSource}

export type TaskWorkflowReceipt = {
  operationId: string
  taskId: string
  revision: string
  kind: TaskWorkflowCommand["kind"]
  recordId: string
  confirmedSeconds: number
}

export type TaskWorkflowRecord = {
  id: string
  taskId: string
  actorId: string
  source: ActorSource
  runtimeId: string
  checkpointMonotonic: number | null
  proposalCommentId: string | null
  command: TaskWorkflowCommand
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
  checkpointAt: number
  expiresAt: number
  expired: boolean
}

export type TaskWorkflowProposal = {
  id: string
  commentId: string | null
  actorId: string
  changes: Partial<Pick<Task, "scheduled" | "estimatedTime" | "priority">>
  reason: string
  status: "pending"
}

export type TaskWorkflowState = {
  task: Task
  revision: string
  records: TaskWorkflowRecord[]
  activeSessions: TaskWorkflowSession[]
  proposals: TaskWorkflowProposal[]
  confirmedSeconds: number
}
