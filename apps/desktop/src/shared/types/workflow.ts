import type {TaskWorkflowState, WorkflowGuidance, WorkflowGuidanceDocument} from "@daily/protocol"

export type WorkflowResult<T> =
  | {ok: true; value: T}
  | {ok: false; code: string; message: string; current: TaskWorkflowState | null; currentGuidance?: WorkflowGuidanceDocument | null}

export type GuidanceResult = WorkflowResult<WorkflowGuidance>
export type GuidanceSaveResult = WorkflowResult<WorkflowGuidanceDocument>
export type TaskWorkflowResult = WorkflowResult<TaskWorkflowState>
