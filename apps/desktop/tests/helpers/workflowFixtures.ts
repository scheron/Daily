import {makeTask} from "./taskFixtures"

import type {TaskWorkflowProposal, TaskWorkflowState, WorkflowGuidance} from "@daily/protocol"

export function makeWorkflowGuidance(overrides: Partial<WorkflowGuidance["workspace"]> = {}): WorkflowGuidance {
  return {
    workspace: {
      scope: {kind: "workspace"},
      content: "Workspace instructions",
      allowCompletion: false,
      revision: "revision-1",
      history: [],
      ...overrides,
    },
    project: null,
    allowCompletion: false,
    timePolicy: {maxObservedIntervalSeconds: 1800, requiresHeartbeat: false},
  }
}

export function makeTaskWorkflowProposal(overrides: Partial<TaskWorkflowProposal> = {}): TaskWorkflowProposal {
  return {
    id: "proposal-1",
    commentId: null,
    actorId: "test-agent",
    changes: {estimatedTime: 1200},
    originalValues: {estimatedTime: 600},
    reason: "Allow time for review",
    status: "pending",
    resolutionRecordId: null,
    conflict: false,
    ...overrides,
  }
}

export function makeTaskWorkflow(overrides: Partial<TaskWorkflowState> = {}): TaskWorkflowState {
  return {
    revision: "original",
    task: makeTask(),
    sessions: [],
    activeSessions: [],
    records: [],
    confirmedSeconds: 0,
    guidance: makeWorkflowGuidance(),
    proposals: [makeTaskWorkflowProposal()],
    ...overrides,
  }
}
