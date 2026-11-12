import {workflowGuidanceView} from "../workflow/workflowGuidanceView"

import type {TaskWorkflowState} from "@daily/protocol"

export function taskWorkflowView(state: TaskWorkflowState) {
  return {...state, guidance: workflowGuidanceView(state.guidance)}
}
