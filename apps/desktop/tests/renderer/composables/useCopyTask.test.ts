// @vitest-environment happy-dom
import {effectScope} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {parse as parseYaml} from "yaml"

import {useSubtasksStore} from "../../../src/renderer/src/stores/subtasks"
import {useTaskEditorStore} from "../../../src/renderer/src/stores/task-editor"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks"
import {useCopyTask} from "../../../src/renderer/src/composables/tasks/useCopyTask"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {stubClipboard} from "../../helpers/clipboard"
import {makeSubtask, makeTask} from "../../helpers/taskFixtures"

import type {Subtask} from "@daily/protocol"
import type {EffectScope} from "vue"

describe("useCopyTask", () => {
  const clipboard = stubClipboard()

  let scope: EffectScope | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    scope?.stop()
    scope = null
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mountCopyTask(bridgeOverrides: Record<string, unknown> = {}) {
    const bridge = mockBridgeIPC({
      "subtasks:get-by-task": vi.fn().mockResolvedValue([]),
      "tasks:update": vi.fn().mockResolvedValue({}),
      ...bridgeOverrides,
    })

    let composable!: ReturnType<typeof useCopyTask>
    scope = effectScope()
    scope.run(() => {
      composable = useCopyTask()
    })

    return {
      ...composable,
      bridge,
      subtasksStore: useSubtasksStore(),
      taskEditorStore: useTaskEditorStore(),
      tasksStore: useTasksStore(),
    }
  }

  it("copies a saved task with ordered live subtasks as raw YAML, toasts, and resets isCopied after 1500ms [task-copy#yaml-structure]", async () => {
    vi.useFakeTimers()
    const task = makeTask({id: "task-1", content: "# Title\n\nBody"})
    const {copyTask, isCopied, bridge} = mountCopyTask({
      "subtasks:get-by-task": vi
        .fn()
        .mockResolvedValue([
          makeSubtask({id: "sub-b", taskId: "task-1", done: true, content: "Second", orderKey: "b"}),
          makeSubtask({id: "sub-a", taskId: "task-1", done: false, content: "First", orderKey: "a"}),
        ]),
    })

    await copyTask(task)

    expect(clipboard.read()).toBe(
      "version: 1\nid: task-1\ncontent: |-\n  # Title\n\n  Body\nsubtasks:\n  - id: sub-a\n    done: false\n    content: First\n  - id: sub-b\n    done: true\n    content: Second\n",
    )
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "success", message: "Task copied to clipboard"})
    expect(isCopied.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1500)
    expect(isCopied.value).toBe(false)
  })

  it("waits for an already in-flight subtask load before serializing and copying [task-copy#yaml-structure]", async () => {
    let resolveLoad!: (subtasks: Subtask[]) => void
    const getSubtasks = vi.fn().mockReturnValue(
      new Promise<Subtask[]>((resolve) => {
        resolveLoad = resolve
      }),
    )
    const task = makeTask({id: "task-1", content: "Task body"})
    const {copyTask, isCopied, subtasksStore} = mountCopyTask({"subtasks:get-by-task": getSubtasks})

    void subtasksStore.loadSubtasks("task-1")
    const copying = copyTask(task)

    await Promise.resolve()
    expect(clipboard.read()).toBeNull()
    expect(isCopied.value).toBe(false)

    resolveLoad([makeSubtask({id: "sub-1", taskId: "task-1", done: true, content: "Loaded subtask"})])
    await copying

    expect(getSubtasks).toHaveBeenCalledTimes(1)
    expect(parseYaml(clipboard.read() ?? "")).toEqual({
      version: 1,
      id: "task-1",
      content: "Task body",
      subtasks: [{id: "sub-1", done: true, content: "Loaded subtask"}],
    })
  })

  it("blocks copying the open task when any field has unsaved edits without touching the clipboard [task-copy#blocks-unsaved-draft]", async () => {
    const task = makeTask({id: "task-1", content: "Saved content", priority: "low"})
    const getSubtasks = vi.fn().mockResolvedValue([])
    const {copyTask, isCopied, bridge, taskEditorStore, tasksStore} = mountCopyTask({"subtasks:get-by-task": getSubtasks})
    tasksStore.tasks = [task]

    await taskEditorStore.open("task-1")
    taskEditorStore.patch({priority: "urgent"})

    await copyTask(task)

    expect(clipboard.read()).toBeNull()
    expect(isCopied.value).toBe(false)
    expect(getSubtasks).not.toHaveBeenCalled()
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "info", message: "Save changes before copying task"})
  })

  it("allows copying a different card while the open task is dirty, and copies the open task after saving [task-copy#blocks-unsaved-draft]", async () => {
    const openTask = makeTask({id: "task-1", content: "Original"})
    const otherTask = makeTask({id: "task-2", content: "Other card"})
    const {copyTask, bridge, taskEditorStore, tasksStore} = mountCopyTask({
      "tasks:update": vi.fn().mockResolvedValue({
        tasks: {upserted: [{...openTask, content: "Saved edit"}]},
      }),
    })
    tasksStore.tasks = [openTask, otherTask]

    await taskEditorStore.open("task-1")
    taskEditorStore.patch({content: "Saved edit"})

    await copyTask(otherTask)

    expect(parseYaml(clipboard.read() ?? "")).toEqual({
      version: 1,
      id: "task-2",
      content: "Other card",
      subtasks: [],
    })
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "success", message: "Task copied to clipboard"})

    clipboard.clear()
    bridge["toast:publish"].mockClear()

    await taskEditorStore.commit()
    await copyTask({...openTask, content: "Saved edit"})

    expect(parseYaml(clipboard.read() ?? "")).toEqual({
      version: 1,
      id: "task-1",
      content: "Saved edit",
      subtasks: [],
    })
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "success", message: "Task copied to clipboard"})
  })

  it("surfaces Failed to copy task without touching the clipboard when loading subtasks fails, and recovers on retry", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const task = makeTask({id: "task-1", content: "Task body"})
    const getSubtasks = vi
      .fn()
      .mockRejectedValueOnce(new Error("ipc down"))
      .mockResolvedValueOnce([makeSubtask({id: "sub-1", taskId: "task-1", content: "Recovered"})])
    const {copyTask, isCopied, bridge} = mountCopyTask({"subtasks:get-by-task": getSubtasks})

    await copyTask(task)

    expect(clipboard.read()).toBeNull()
    expect(isCopied.value).toBe(false)
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "error", message: "Failed to copy task"})
    expect(consoleError).toHaveBeenCalled()

    bridge["toast:publish"].mockClear()
    await copyTask(task)

    expect(parseYaml(clipboard.read() ?? "")).toEqual({
      version: 1,
      id: "task-1",
      content: "Task body",
      subtasks: [{id: "sub-1", done: false, content: "Recovered"}],
    })
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "success", message: "Task copied to clipboard"})
    expect(isCopied.value).toBe(true)
  })
})
