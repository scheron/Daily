import type {Task} from "@daily/protocol"

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "in_progress",
    content: "Task",
    minimized: false,
    priority: "none",
    orderIndex: 1024,
    scheduled: {date: "2030-01-02", time: "09:00:00", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    createdAt: "2030-01-01T00:00:00Z",
    updatedAt: "2030-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  }
}
