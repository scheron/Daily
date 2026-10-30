import {describe, expect, it} from "vitest"

import {taskDetailView} from "../src/views"

import type {Task, TaskEvent} from "@daily/protocol"

function makeTask(): Task {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "in_progress",
    priority: "none",
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    deletedAt: null,
  }
}

function makeEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: "event-1",
    taskId: "task-1",
    branchId: "main",
    type: "created",
    eventDate: "2026-10-31",
    fromDate: null,
    toDate: null,
    createdAt: "2026-10-31T09:00:00.000Z",
    kind: "manual",
    provider: null,
    ...overrides,
  }
}

function historyView(history: TaskEvent[]) {
  return taskDetailView(makeTask(), "Main", {history, blockedBy: [], blocks: [], attachments: [], comments: [], subtasks: [], movedCount: 0}).history
}

describe("MCP task history", () => {
  it("keeps category transitions and attribution while exposing projects by their public name", () => {
    const [status, priority, project] = historyView([
      makeEvent({type: "status_changed", fromStatus: "ready_for_agent", toStatus: "in_progress", sequence: 1, kind: "mcp", provider: "Codex"}),
      makeEvent({type: "priority_changed", fromPriority: "none", toPriority: "high", sequence: 2}),
      makeEvent({type: "project_changed", fromBranchId: "main", toBranchId: "project-2", sequence: 3}),
    ])

    expect(status).toMatchObject({fromStatus: "ready_for_agent", toStatus: "in_progress", sequence: 1, kind: "mcp", provider: "Codex"})
    expect(priority).toMatchObject({fromPriority: "none", toPriority: "high", sequence: 2})
    expect(project).toMatchObject({fromProjectId: "main", toProjectId: "project-2", sequence: 3})
    expect(project).not.toHaveProperty("fromBranchId")
    expect(project).not.toHaveProperty("toBranchId")
  })

  it("returns unknown legacy transitions as null rather than inferring them from the current task", () => {
    const [event] = historyView([makeEvent({type: "reactivated"})])

    expect(event).toMatchObject({
      type: "reactivated",
      fromStatus: null,
      toStatus: null,
      fromPriority: null,
      toPriority: null,
      fromProjectId: null,
      toProjectId: null,
      sequence: 0,
    })
  })
})
