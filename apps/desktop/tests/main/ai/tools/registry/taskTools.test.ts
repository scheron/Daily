// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {toTaskRelationId} from "@daily/protocol"

import {formatTask} from "../../../../../src/main/ai/utils/formatters"
import {describeToolCall} from "../../../../../src/main/ai/policy/describeToolCall"
import {TASK_TOOLS} from "../../../../../src/main/ai/tools/registry/categories/tasks"
import {ToolExecutor} from "../../../../../src/main/ai/tools/ToolExecutor"

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeTask(overrides = {}) {
  return {
    id: "t1",
    status: "active",
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "P",
    milestoneId: null,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeStorage(overrides = {}) {
  return {
    getTask: vi.fn(async () => null),
    getBranch: vi.fn(async () => ({id: "P", name: "Project"})),
    getTaskRelations: vi.fn(async () => ({blockedBy: [], blocks: []})),
    setTaskRelations: vi.fn(async () => ({})),
    getTaskComments: vi.fn(async () => []),
    createTaskComment: vi.fn(async () => ({})),
    updateTaskComment: vi.fn(async () => ({})),
    deleteTaskComment: vi.fn(async () => ({})),
    ...overrides,
  }
}

describe("Task tools registry", () => {
  it("exposes 18 task tools", () => {
    expect(TASK_TOOLS.length).toBe(18)
  })

  it("each has parameters.type === 'object'", () => {
    for (const t of TASK_TOOLS) {
      expect(t.parameters.type).toBe("object")
    }
  })

  it("write tools are marked isWrite", () => {
    const writes = TASK_TOOLS.filter((t) => t.isWrite).map((t) => t.name)
    expect(writes.sort()).toEqual(
      [
        "complete_task",
        "create_task",
        "delete_task",
        "delete_task_comment",
        "discard_task",
        "link_tasks",
        "log_time",
        "move_task",
        "permanently_delete_task",
        "reactivate_task",
        "restore_task",
        "save_task_comment",
        "unlink_tasks",
        "update_task",
      ].sort(),
    )
  })

  it("destructive tools are flagged", () => {
    const destructive = TASK_TOOLS.filter((t) => t.isDestructive).map((t) => t.name)
    expect(destructive.sort()).toEqual(["delete_task", "delete_task_comment", "permanently_delete_task", "unlink_tasks"].sort())
  })

  it("has_TC-16_18_task_tools_with_link_tasks_a_write_and_unlink_tasks_a_write_and_destructive", () => {
    expect(TASK_TOOLS.length).toBe(18)

    const linkTasks = TASK_TOOLS.find((t) => t.name === "link_tasks")
    expect(linkTasks?.isWrite).toBe(true)
    expect(linkTasks?.isDestructive).toBe(false)

    const unlinkTasks = TASK_TOOLS.find((t) => t.name === "unlink_tasks")
    expect(unlinkTasks?.isWrite).toBe(true)
    expect(unlinkTasks?.isDestructive).toBe(true)
  })

  it("lists_TC-16_a_blocked_by_line_and_no_blocks_line_for_get_task_and_neither_line_for_an_unlinked_task", async () => {
    const linked = makeTask({id: "t1"})
    const blocker = makeTask({id: "b1", content: "Blocker"})
    const linkedStorage = makeStorage({
      getTask: vi.fn(async (id) => (id === "t1" ? linked : null)),
      getTaskRelations: vi.fn(async () => ({blockedBy: [blocker], blocks: []})),
    })
    const linkedResult = await new ToolExecutor(linkedStorage).execute("get_task", {task_id: "t1"}, "in-app")
    expect(linkedResult.success).toBe(true)
    expect(linkedResult.data).toContain(`Blocked by:\n- ${formatTask(blocker)}`)
    expect(linkedResult.data).not.toContain("Blocks:")

    const unlinked = makeTask({id: "t2"})
    const unlinkedStorage = makeStorage({getTask: vi.fn(async (id) => (id === "t2" ? unlinked : null))})
    const unlinkedResult = await new ToolExecutor(unlinkedStorage).execute("get_task", {task_id: "t2"}, "in-app")
    expect(unlinkedResult.success).toBe(true)
    expect(unlinkedResult.data).not.toContain("Blocked by:")
    expect(unlinkedResult.data).not.toContain("Blocks:")
  })

  it("links_TC-16_an_unlinked_pair_by_sending_the_blocked_tasks_current_blockers_plus_the_new_one_reports_success_for_an_already-linked_pair_and_an_error_when_storage_refuses", async () => {
    const currentBlocker = makeTask({id: "existing-blocker"})
    const unlinkedStorage = makeStorage({
      getTaskRelations: vi.fn(async () => ({blockedBy: [currentBlocker], blocks: []})),
      setTaskRelations: vi.fn(async () => ({relations: {upserted: [{id: "new:blocked", blockerId: "new-blocker", blockedId: "blocked"}]}})),
    })
    const linked = await new ToolExecutor(unlinkedStorage).execute(
      "link_tasks",
      {blocker_task_id: "new-blocker", blocked_task_id: "blocked"},
      "in-app",
    )
    expect(unlinkedStorage.setTaskRelations).toHaveBeenCalledWith("blocked", {blockedBy: ["existing-blocker", "new-blocker"], blocks: []})
    expect(linked.success).toBe(true)
    expect(linked.changedEntities).toEqual(
      expect.arrayContaining([
        {type: "task", id: "new-blocker", action: "updated"},
        {type: "task", id: "blocked", action: "updated"},
      ]),
    )
    expect(linked.changedEntities).toHaveLength(2)

    const alreadyLinkedBlocker = makeTask({id: "blocker"})
    const alreadyLinkedStorage = makeStorage({
      getTaskRelations: vi.fn(async () => ({blockedBy: [alreadyLinkedBlocker], blocks: []})),
    })
    const alreadyLinked = await new ToolExecutor(alreadyLinkedStorage).execute(
      "link_tasks",
      {blocker_task_id: "blocker", blocked_task_id: "blocked"},
      "in-app",
    )
    expect(alreadyLinkedStorage.setTaskRelations).not.toHaveBeenCalled()
    expect(alreadyLinked.success).toBe(true)
    expect(alreadyLinked.data).toContain("Already linked")

    const refusedStorage = makeStorage({setTaskRelations: vi.fn(async () => ({}))})
    const refused = await new ToolExecutor(refusedStorage).execute("link_tasks", {blocker_task_id: "blocker", blocked_task_id: "blocked"}, "in-app")
    expect(refused.success).toBe(false)
    expect(refused.error).toBe(
      "Cannot link these tasks: both must exist, be different, belong to the same project, and must not end up waiting on each other.",
    )
  })

  it("unlinks_TC-16_a_linked_pair_by_sending_both_sides_without_the_other_task_and_reports_the_pair_is_not_linked_otherwise", async () => {
    const other = makeTask({id: "other"})
    const linkedStorage = makeStorage({
      getTaskRelations: vi.fn(async () => ({blockedBy: [other], blocks: []})),
      setTaskRelations: vi.fn(async () => ({relations: {removed: [toTaskRelationId("task", "other")]}})),
    })
    const unlinked = await new ToolExecutor(linkedStorage).execute("unlink_tasks", {task_id: "task", other_task_id: "other"}, "in-app")
    expect(linkedStorage.setTaskRelations).toHaveBeenCalledWith("task", {blockedBy: [], blocks: []})
    expect(unlinked.success).toBe(true)
    expect(unlinked.changedEntities).toEqual(
      expect.arrayContaining([
        {type: "task", id: "task", action: "updated"},
        {type: "task", id: "other", action: "updated"},
      ]),
    )
    expect(unlinked.changedEntities).toHaveLength(2)

    const unlinkedStorage = makeStorage()
    const notLinked = await new ToolExecutor(unlinkedStorage).execute("unlink_tasks", {task_id: "task", other_task_id: "other"}, "in-app")
    expect(unlinkedStorage.setTaskRelations).not.toHaveBeenCalled()
    expect(notLinked.success).toBe(false)
    expect(notLinked.error).toContain("Tasks are not linked")
  })

  it("builds_TC-16_the_unlink_tasks_confirmation_card_titled_Unlink_tasks", () => {
    const described = describeToolCall("unlink_tasks", {task_id: "t1", other_task_id: "t2"})
    expect(described.title).toBe("Unlink tasks")
  })
  it("writes_a_comment_as_the_built_in_agent_and_never_as_the_source_the_params_name", async () => {
    const storage = makeStorage({
      createTaskComment: vi.fn(async () => ({comments: {upserted: [{id: "c1", taskId: "t1", kind: "agent", provider: "daily_agent"}]}})),
    })

    const written = await new ToolExecutor(storage).execute(
      "save_task_comment",
      {task_id: "t1", content: "Blocked on review", kind: "manual", provider: "The User"},
      "in-app",
    )

    expect(storage.createTaskComment).toHaveBeenCalledWith("t1", "Blocked on review", {kind: "agent"})
    expect(written.success).toBe(true)
    expect(written.changedEntities).toEqual([{type: "comment", id: "c1", action: "created"}])
  })

  it("rewrites_the_comment_the_params_name_instead_of_writing_a_second_one", async () => {
    const storage = makeStorage({
      updateTaskComment: vi.fn(async () => ({comments: {upserted: [{id: "c1", taskId: "t1", kind: "agent", provider: "daily_agent"}]}})),
    })

    const rewritten = await new ToolExecutor(storage).execute("save_task_comment", {comment_id: "c1", content: "Review landed"}, "in-app")

    expect(storage.updateTaskComment).toHaveBeenCalledWith("c1", "Review landed")
    expect(storage.createTaskComment).not.toHaveBeenCalled()
    expect(rewritten.changedEntities).toEqual([{type: "comment", id: "c1", action: "updated"}])
  })

  it("refuses_a_new_comment_with_no_task_blank_content_or_a_comment_id_nothing_answers_to", async () => {
    const storage = makeStorage()

    const noTask = await new ToolExecutor(storage).execute("save_task_comment", {content: "orphan"}, "in-app")
    expect(noTask.success).toBe(false)
    expect(noTask.error).toContain("task_id")

    const blank = await new ToolExecutor(storage).execute("save_task_comment", {task_id: "t1", content: "   "}, "in-app")
    expect(blank.success).toBe(false)

    const unknown = await new ToolExecutor(storage).execute("save_task_comment", {comment_id: "gone", content: "hi"}, "in-app")
    expect(unknown.success).toBe(false)
    expect(unknown.error).toContain("gone")

    expect(storage.createTaskComment).not.toHaveBeenCalled()
  })

  it("deletes_a_comment_and_reports_an_unknown_one_as_not_found", async () => {
    const storage = makeStorage({deleteTaskComment: vi.fn(async () => ({comments: {removed: ["c1"]}}))})

    const deleted = await new ToolExecutor(storage).execute("delete_task_comment", {comment_id: "c1"}, "in-app")
    expect(deleted.success).toBe(true)
    expect(deleted.changedEntities).toEqual([{type: "comment", id: "c1", action: "deleted"}])

    const missing = await new ToolExecutor(makeStorage()).execute("delete_task_comment", {comment_id: "gone"}, "in-app")
    expect(missing.success).toBe(false)
    expect(missing.error).toContain("gone")
  })

  it("builds_the_delete_task_comment_confirmation_card_so_the_delete_suspends_like_every_other_destructive_tool", () => {
    const deleteComment = TASK_TOOLS.find((t) => t.name === "delete_task_comment")
    expect(deleteComment?.isDestructive).toBe(true)

    const described = describeToolCall("delete_task_comment", {comment_id: "c1"})
    expect(described.title).toBe("Delete comment")
    expect(described.summary).toContain("c1")
  })

  it("lists_a_tasks_comments_with_their_ids_and_who_wrote_them_and_says_nothing_when_there_are_none", async () => {
    const task = makeTask({id: "t1"})
    const commented = makeStorage({
      getTask: vi.fn(async () => task),
      getTaskComments: vi.fn(async () => [
        {id: "c1", taskId: "t1", content: "typed by hand", kind: "manual", provider: null},
        {id: "c2", taskId: "t1", content: "left by the agent", kind: "agent", provider: "daily_agent"},
        {id: "c3", taskId: "t1", content: "sent through MCP", kind: "mcp", provider: "Claude Code"},
      ]),
    })

    const withComments = await new ToolExecutor(commented).execute("get_task", {task_id: "t1"}, "in-app")
    expect(withComments.data).toContain("- [c1] user: typed by hand")
    expect(withComments.data).toContain("- [c2] daily_agent: left by the agent")
    expect(withComments.data).toContain("- [c3] Claude Code: sent through MCP")

    const quiet = await new ToolExecutor(makeStorage({getTask: vi.fn(async () => task)})).execute("get_task", {task_id: "t1"}, "in-app")
    expect(quiet.data).not.toContain("Comments:")
  })
})
