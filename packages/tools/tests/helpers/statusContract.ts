import {expect} from "vitest"

import type {MilestoneView, TaskDetailView, TaskView} from "../../src/views"

type CallTool = (name: string, input: Record<string, unknown>) => Promise<unknown>

export async function exerciseStatusContract(call: CallTool, author: {kind: string; provider: string | null}): Promise<void> {
  const statuses = ["backlog", "todo", "ready_for_agent", "in_progress", "ready_to_merge", "done", "cancelled"]
  for (const status of statuses) {
    const saved = (await call("save_task", {content: `Synthetic ${status}`, status})) as {task: TaskDetailView}
    expect(saved.task.status).toBe(status)
    if (status === "backlog" || status === "ready_for_agent") expect(saved.task.scheduled).toBeNull()
    const found = (await call("list_tasks", {status})) as {tasks: TaskView[]}
    expect(found.tasks.some((task) => task.id === saved.task.id && task.status === status)).toBe(true)
    const updated = (await call("save_task", {id: saved.task.id, content: `Updated ${status}`, status})) as {task: TaskDetailView}
    expect(updated.task.status).toBe(status)
    const read = (await call("get_task", {id: saved.task.id})) as TaskDetailView
    expect(read.status).toBe(status)
    expect(read.content).toBe(`Updated ${status}`)
    if (status !== "backlog") {
      const moved = (await call("save_task", {id: saved.task.id, date: "2026-10-31"})) as {task: TaskDetailView}
      expect(moved.task).toMatchObject({status, scheduled: {date: "2026-10-31"}})
    }
  }

  const defaultTask = (await call("save_task", {content: "Synthetic planned work"})) as {task: TaskDetailView}
  expect(defaultTask.task.status).toBe("todo")
  expect(defaultTask.task.scheduled?.date).toBeTruthy()
  const planned = (await call("save_task", {content: "Synthetic scheduled work", date: "2026-10-30"})) as {task: TaskDetailView}
  expect(planned.task).toMatchObject({status: "todo", scheduled: {date: "2026-10-30"}})
  const unplanned = (await call("save_task", {content: "Synthetic unscheduled work", date: null})) as {task: TaskDetailView}
  expect(unplanned.task).toMatchObject({status: "backlog", scheduled: null})
  const scheduled = (await call("save_task", {id: unplanned.task.id, date: "2026-10-29"})) as {task: TaskDetailView}
  expect(scheduled.task).toMatchObject({status: "todo", scheduled: {date: "2026-10-29"}})
  const rescheduled = (await call("save_task", {id: scheduled.task.id, date: "2026-10-30"})) as {task: TaskDetailView}
  expect(rescheduled.task).toMatchObject({status: "todo", scheduled: {date: "2026-10-30"}})
  const unscheduled = (await call("save_task", {id: scheduled.task.id, date: null})) as {task: TaskDetailView}
  expect(unscheduled.task).toMatchObject({status: "backlog", scheduled: null})

  const milestone = (await call("save_milestone", {projectId: "main", name: "Synthetic planned milestone"})) as {milestone: MilestoneView}
  const scoped = (await call("save_task", {id: planned.task.id, milestoneId: milestone.milestone.id})) as {task: TaskDetailView}
  expect(scoped.task.status).toBe("todo")
  const dependent = (await call("save_task", {content: "Synthetic dependent", blockedBy: [planned.task.id]})) as {task: TaskDetailView}
  expect(dependent.task.blockedBy).toEqual([expect.objectContaining({id: planned.task.id, status: "todo"})])
  const milestones = (await call("list_milestones", {projectId: "main", includeClosed: false})) as {milestones: MilestoneView[]}
  expect(milestones.milestones).toContainEqual(
    expect.objectContaining({id: milestone.milestone.id, isClosed: false, progress: {total: 1, resolved: 0}}),
  )

  const datedReady = (await call("save_task", {content: "Synthetic dated ready", status: "ready_for_agent", date: "2026-10-30"})) as {
    task: TaskDetailView
  }
  expect(datedReady.task).toMatchObject({status: "ready_for_agent", scheduled: {date: "2026-10-30"}})
  const datedWork = (await call("save_task", {content: "Synthetic dated work", status: "in_progress", date: "2026-10-30"})) as {task: TaskDetailView}
  const prepared = (await call("save_task", {id: datedWork.task.id, status: "ready_for_agent"})) as {task: TaskDetailView}
  expect(prepared.task.scheduled).toEqual(datedWork.task.scheduled)

  const created = (await call("save_task", {content: "Synthetic handoff", status: "backlog"})) as {task: TaskDetailView}
  const id = created.task.id
  const ready = (await call("save_task", {id, status: "ready_for_agent"})) as {task: TaskDetailView}
  expect(ready.task.scheduled).toBeNull()
  const dated = (await call("save_task", {id, date: "2026-10-29"})) as {task: TaskDetailView}
  expect(dated.task.status).toBe("ready_for_agent")
  expect(dated.task.scheduled?.date).toBe("2026-10-29")
  const cleared = (await call("save_task", {id, date: null})) as {task: TaskDetailView}
  expect(cleared.task).toMatchObject({status: "ready_for_agent", scheduled: null})
  const started = (await call("save_task", {id, status: "in_progress", date: "2026-10-29"})) as {task: TaskDetailView}
  expect(started.task.status).toBe("in_progress")
  const movedWork = (await call("save_task", {id, date: "2026-10-30"})) as {task: TaskDetailView}
  expect(movedWork.task).toMatchObject({status: "in_progress", scheduled: {date: "2026-10-30"}})
  await call("save_task", {id, status: "ready_to_merge"})
  await call("save_comment", {taskId: id, content: "Synthetic implementation ready for review"})
  const handoff = (await call("get_task", {id})) as TaskDetailView
  expect(handoff).toMatchObject({status: "ready_to_merge", scheduled: {date: "2026-10-30"}})
  expect(handoff.comments).toEqual([expect.objectContaining({content: "Synthetic implementation ready for review", ...author})])
  expect(handoff.history.length).toBeGreaterThan(0)
  expect(handoff.history.every((event) => event.kind === author.kind && event.provider === author.provider)).toBe(true)

  const batch = (await call("save_task", {
    tasks: [
      {id, status: "ready_for_agent", date: null},
      {content: "Synthetic batch", date: "2026-10-30"},
    ],
  })) as {tasks: TaskDetailView[]}
  expect(batch.tasks[0]).toMatchObject({status: "ready_for_agent", scheduled: null})
  expect(batch.tasks[1]).toMatchObject({status: "todo", scheduled: {date: "2026-10-30"}})
  const before = (await call("get_task", {id})) as TaskDetailView
  await expect(
    call("save_task", {
      tasks: [
        {id, status: "todo", date: "2026-10-30"},
        {id: "synthetic-missing", status: "ready_to_merge"},
      ],
    }),
  ).rejects.toThrow()
  expect(await call("get_task", {id})).toEqual(before)
}
