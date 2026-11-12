import type {WorkflowGuidance, WorkflowGuidanceDocument} from "@daily/protocol"

/** Agent contexts carry current preferences and policy; guidance audit history stays in Daily's trusted interface. */
export function workflowGuidanceView(guidance: WorkflowGuidance) {
  return {
    workspace: guidanceDocumentView(guidance.workspace),
    project: guidance.project ? guidanceDocumentView(guidance.project) : null,
    allowCompletion: guidance.allowCompletion,
    timePolicy: guidance.timePolicy,
  }
}

function guidanceDocumentView(document: WorkflowGuidanceDocument) {
  return {scope: document.scope, content: document.content, allowCompletion: document.allowCompletion, revision: document.revision}
}
