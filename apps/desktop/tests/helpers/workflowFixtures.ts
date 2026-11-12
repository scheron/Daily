import type {WorkflowGuidance} from "@daily/protocol"

export function makeWorkflowGuidance(content = "Workspace instructions"): WorkflowGuidance {
  return {
    workspace: {scope: {kind: "workspace"}, content, allowCompletion: false, revision: "revision-1", history: []},
    project: null,
    allowCompletion: false,
    timePolicy: {maxObservedIntervalSeconds: 1800, requiresHeartbeat: false},
  }
}
