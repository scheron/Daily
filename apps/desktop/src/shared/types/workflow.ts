import type {TaskWorkflowResolution, TaskWorkflowState, WorkflowGuidance, WorkflowGuidanceDocument, WorkflowGuidanceUpdate} from "@daily/protocol"

export type WorkflowResult<T> =
  | {ok: true; value: T}
  | {ok: false; code: string; message: string; current: TaskWorkflowState | null; currentGuidance?: WorkflowGuidanceDocument | null}

export type GuidanceUpdate = WorkflowGuidanceUpdate
export type ProposalResolution = TaskWorkflowResolution
export type GuidanceResult = WorkflowResult<WorkflowGuidance>
export type GuidanceSaveResult = WorkflowResult<WorkflowGuidanceDocument>
export type TaskWorkflowResult = WorkflowResult<TaskWorkflowState>
