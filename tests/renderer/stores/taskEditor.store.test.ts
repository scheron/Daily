// @ts-nocheck
import {nextTick, ref} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    branchId: "main",
    content: "hello",
    tags: [],
    estimatedTime: 1800,
    spentTime: 0,
    status: "active",
    scheduled: {date: "2026-06-20", time: "09:00:00", timezone: "UTC"},
    minimized: false,
    orderIndex: 1024,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    attachments: [],
    ...overrides,
  }
}

async function setupStores() {
  const {useTasksStore} = await import("@renderer/stores/tasks/tasks.store")
  const {useTaskEditorStore} = await import("@renderer/stores/task-editor")
  const tasks = useTasksStore()
  const editor = useTaskEditorStore()
  tasks.createTask = vi.fn().mockResolvedValue({id: "new-task"})
  tasks.updateTask = vi.fn().mockResolvedValue(undefined)
  tasks.moveTask = vi.fn().mockResolvedValue(undefined)
  tasks.moveTaskToBranch = vi.fn().mockResolvedValue(undefined)
  return {tasks, editor}
}

describe("taskEditorStore — state + computeds", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  it("starts empty: isOpen=false, isNew=false, isDirty=false", async () => {
    const {editor} = await setupStores()
    expect(editor.draft).toBeNull()
    expect(editor.editingTaskId).toBeNull()
    expect(editor.isOpen).toBe(false)
    expect(editor.isNew).toBe(false)
    expect(editor.isDirty).toBe(false)
  })
})

describe("taskEditorStore — seeding", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  it("open seeds the draft from an existing task", async () => {
    const {tasks, editor} = await setupStores()
    const task = makeTask({id: "abc", content: "X"})
    tasks.findTaskById = vi.fn().mockReturnValue(task)

    await editor.open("abc")

    expect(editor.isOpen).toBe(true)
    expect(editor.isNew).toBe(false)
    expect(editor.isDirty).toBe(false)
    expect(editor.editingTaskId).toBe("abc")
    expect(editor.draft?.content).toBe("X")
  })

  it("does not open a soft-deleted task resolved from storage", async () => {
    mockBridgeIPC({"tasks:get-one": vi.fn().mockResolvedValue(makeTask({id: "gone", deletedAt: "2026-01-02T00:00:00Z"}))})
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(null)

    await editor.open("gone")

    expect(editor.isOpen).toBe(false)
    expect(editor.draft).toBeNull()
  })

  it("openNew seeds an empty draft with defaults", async () => {
    const {editor} = await setupStores()
    editor.openNew({date: "2026-06-20", branchId: "main"})

    expect(editor.isOpen).toBe(true)
    expect(editor.isNew).toBe(true)
    expect(editor.isDirty).toBe(false)
    expect(editor.editingTaskId).toBeNull()
    expect(editor.draft?.content).toBe("")
    expect(editor.draft?.status).toBe("active")
    expect(editor.draft?.scheduled.date).toBe("2026-06-20")
    expect(editor.draft?.branchId).toBe("main")
  })

  it("clear resets everything", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask())
    await editor.open("task-1")
    editor.clear()

    expect(editor.draft).toBeNull()
    expect(editor.editingTaskId).toBeNull()
    expect(editor.isOpen).toBe(false)
  })
})

describe("taskEditorStore — patch + discard", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  it("patch on an existing draft marks isDirty true", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({content: "before"}))
    await editor.open("task-1")
    expect(editor.isDirty).toBe(false)

    editor.patch({content: "after"})
    expect(editor.draft?.content).toBe("after")
    expect(editor.isDirty).toBe(true)
  })

  it("patch back to the original value clears isDirty", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({content: "before"}))
    await editor.open("task-1")
    editor.patch({content: "after"})
    expect(editor.isDirty).toBe(true)

    editor.patch({content: "before"})
    expect(editor.isDirty).toBe(false)
  })

  it("patch on a new draft marks isDirty once content is non-empty", async () => {
    const {editor} = await setupStores()
    editor.openNew({date: "2026-06-20", branchId: "main"})
    expect(editor.isDirty).toBe(false)

    editor.patch({content: "hello"})
    expect(editor.isDirty).toBe(true)
  })

  it("discard reverts draft to its base on an existing draft", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({content: "before"}))
    await editor.open("task-1")
    editor.patch({content: "after"})

    editor.discard()
    expect(editor.draft?.content).toBe("before")
    expect(editor.isDirty).toBe(false)
  })

  it("discard clears entirely on a new draft", async () => {
    const {editor} = await setupStores()
    editor.openNew({date: "2026-06-20", branchId: "main"})
    editor.patch({content: "hello"})

    editor.discard()
    expect(editor.isOpen).toBe(false)
    expect(editor.isNew).toBe(false)
  })
})

describe("taskEditorStore — commit", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  it("commit on an existing draft with content change calls updateTask", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({content: "before"}))
    await editor.open("task-1")
    editor.patch({content: "after"})

    await editor.commit()
    expect(tasks.updateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({content: "after"}))
    expect(tasks.moveTask).not.toHaveBeenCalled()
    expect(tasks.moveTaskToBranch).not.toHaveBeenCalled()
  })

  it("commit on a date change calls moveTask", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({scheduled: {date: "2026-06-20", time: "09:00:00", timezone: "UTC"}}))
    await editor.open("task-1")
    editor.patch({scheduled: {date: "2026-06-21", time: "09:00:00", timezone: "UTC"}})

    await editor.commit()
    expect(tasks.moveTask).toHaveBeenCalledWith("task-1", "2026-06-21")
  })

  it("commit on a branch change calls moveTaskToBranch", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({branchId: "main"}))
    await editor.open("task-1")
    editor.patch({branchId: "personal"})

    await editor.commit()
    expect(tasks.moveTaskToBranch).toHaveBeenCalledWith("task-1", "personal")
  })

  it("commit on a new draft calls createTask", async () => {
    const {tasks, editor} = await setupStores()
    editor.openNew({date: "2026-06-20", branchId: "main"})
    editor.patch({content: "fresh"})

    await editor.commit()
    expect(tasks.createTask).toHaveBeenCalledWith(expect.objectContaining({content: "fresh", date: "2026-06-20", branchId: "main"}))
  })

  it("commit clears isDirty by reseeding the base", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({content: "before"}))
    await editor.open("task-1")
    editor.patch({content: "after"})
    expect(editor.isDirty).toBe(true)

    await editor.commit()
    expect(editor.isDirty).toBe(false)
  })

  it("commitAndClose commits then clears", async () => {
    const {tasks, editor} = await setupStores()
    tasks.findTaskById = vi.fn().mockReturnValue(makeTask({content: "before"}))
    await editor.open("task-1")
    editor.patch({content: "after"})

    await editor.commitAndClose()
    expect(editor.isOpen).toBe(false)
  })
})

describe("taskEditorStore — external sync", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  it("reflects an external status change while open and not dirty", async () => {
    const {tasks, editor} = await setupStores()
    const live = ref(makeTask({id: "abc", status: "active"}))
    tasks.findTaskById = (id) => (id === "abc" ? live.value : null)

    await editor.open("abc")
    await nextTick()
    expect(editor.draft?.status).toBe("active")

    live.value = {...live.value, status: "done", updatedAt: "2026-01-02T00:00:00Z"}
    await nextTick()

    expect(editor.draft?.status).toBe("done")
    expect(editor.isDirty).toBe(false)
  })

  it("does not clobber unsaved edits when the task changes externally", async () => {
    const {tasks, editor} = await setupStores()
    const live = ref(makeTask({id: "abc", status: "active", content: "before"}))
    tasks.findTaskById = (id) => (id === "abc" ? live.value : null)

    await editor.open("abc")
    await nextTick()
    editor.patch({content: "my edits"})

    live.value = {...live.value, status: "done", updatedAt: "2026-01-02T00:00:00Z"}
    await nextTick()

    expect(editor.draft?.content).toBe("my edits")
    expect(editor.draft?.status).toBe("active")
  })
})
