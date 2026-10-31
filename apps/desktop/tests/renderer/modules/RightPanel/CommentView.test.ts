// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, h} from "vue"
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

const MarkdownEditor = defineComponent({
  name: "MarkdownEditor",
  props: {content: String, attachments: Boolean, grow: Boolean},
  emits: ["update:content"],
  setup(props, {emit, expose}) {
    expose({focus: () => undefined})
    return () =>
      h("textarea", {"aria-label": "Markdown content", value: props.content, onInput: (event) => emit("update:content", event.target.value)})
  },
})

vi.mock("../../../../src/renderer/src/ui/common/misc/MarkdownEditor", () => ({default: MarkdownEditor}))
vi.mock("vue-toasts-lite", () => ({toasts: {error: vi.fn()}}))

function makeTask(id) {
  return {
    id,
    branchId: "main",
    milestoneId: null,
    status: "in_progress",
    content: "Parent task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  }
}

function makeComment(id, overrides = {}) {
  return {
    id,
    taskId: "task-1",
    branchId: "main",
    content: `comment ${id}`,
    kind: "manual",
    provider: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeTaskEvent(id, overrides = {}) {
  return {
    id,
    taskId: "task-1",
    type: "created",
    createdAt: "2026-01-01T08:00:00.000Z",
    ...overrides,
  }
}

function makeSubtask(id, overrides = {}) {
  return {
    id,
    taskId: "task-1",
    content: "Existing subtask",
    done: false,
    orderKey: "a",
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("Comment view in the task panel", () => {
  let wrapper = null
  let modalProvider = null

  beforeEach(async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const {nestedTarget} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useNestedView")
    nestedTarget.value = null
  })

  afterEach(async () => {
    wrapper?.unmount()
    wrapper = null
    modalProvider?.unmount()
    modalProvider = null
    const {useBaseModal} = await import("../../../../src/renderer/src/ui/base/BaseModal")
    const {stack, remove} = useBaseModal()
    for (const item of [...stack.value]) remove(item.id)
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function setup(thread = [makeComment("c1")], options = {}) {
    mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "tasks:create": vi.fn(async (request) => ({tasks: {upserted: [{...makeTask(request.id), ...request}]}})),
      "comments:get-counts": vi.fn(async () => ({"task-1": thread.length})),
      "comments:get-by-task": vi.fn(async (taskId) => thread.filter((comment) => comment.taskId === taskId)),
      "activity:get-by-task": vi.fn().mockResolvedValue(options.history ?? []),
      "subtasks:get-by-task": vi.fn().mockResolvedValue(options.subtasks ?? []),
      "comments:update": vi.fn(async (id, content) => ({
        comments: {upserted: [{...thread.find((comment) => comment.id === id), content, updatedAt: "2026-01-01T12:00:00.000Z"}]},
      })),
    })
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    const {useTaskCommentsStore} = await import("../../../../src/renderer/src/stores/taskComments.store")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")
    useTasksStore().tasks = [...new Set(thread.map((comment) => comment.taskId))].map(makeTask)
    const editor = useTaskEditorStore()
    if (options.newTask) editor.openNew({branchId: "main", milestoneId: null})
    else await editor.open("task-1")
    const {default: RightPanel} = await import("../../../../src/renderer/src/ui/modules/RightPanel")
    wrapper = mount(RightPanel, {
      attachTo: document.body,
      props: {width: 420},
      global: {directives: {tooltip: {}}, stubs: {Toolbar: true, Details: true, Editor: true, ...(options.subtasks ? {} : {Subtasks: true})}},
    })
    await flushPromises()
    return {editor, comments: useTaskCommentsStore()}
  }

  function buttonWithIcon(name) {
    return wrapper.findAll("button").find((button) => button.find(`use[href="#${name}"]`).exists())
  }

  it("opens the comment chevron as a Markdown view and returns to the parent with its composer and filter intact", async () => {
    await setup()
    await wrapper.find("textarea").setValue("Unsent new comment")
    await wrapper.find('[aria-label="Only comments"]').trigger("click")

    await wrapper.find("button[aria-label='Open comment']").trigger("click")

    expect(wrapper.findAll("[aria-label='Markdown content']").map((input) => input.element.value)).toEqual(["comment c1"])
    expect(wrapper.findComponent(MarkdownEditor).props("attachments")).toBe(true)
    expect(wrapper.findComponent(MarkdownEditor).props("grow")).toBe(true)
    expect(wrapper.text()).toContain("Parent task")
    await buttonWithIcon("chevron-left").trigger("click")

    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(wrapper.find("textarea").element.value).toBe("Unsent new comment")
    expect(wrapper.find('[aria-label="Only comments"]').attributes("aria-pressed")).toBe("true")
  })

  it.each(["Back", "Escape"])("restores focus to the same comment opener after %s", async (navigation) => {
    await setup()
    const opener = wrapper.find("button[aria-label='Open comment']")
    opener.element.focus()
    await opener.trigger("click")
    wrapper.find("[aria-label='Markdown content']").element.focus()
    if (navigation === "Back") await buttonWithIcon("chevron-left").trigger("click")
    else window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true}))
    await flushPromises()

    expect(document.activeElement).toBe(opener.element)
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
  })

  it("autosaves the comment in place and shows its updated Markdown after returning", async () => {
    const original = makeComment("c1", {kind: "mcp", provider: "claude"})
    const agent = makeComment("c2", {kind: "agent", provider: "daily_agent", createdAt: "2026-01-01T10:00:00.000Z"})
    const {comments} = await setup([original, agent], {
      history: [makeTaskEvent("e1"), makeTaskEvent("e2", {type: "completed", createdAt: "2026-01-01T09:30:00.000Z"})],
    })
    await comments.loadCommentCounts()
    await wrapper.findAll("button[aria-label='Open comment']")[1].trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("# Edited\n\n**Latest** content")
    await vi.advanceTimersByTimeAsync(400)

    expect(comments.commentsOf("task-1")).toEqual([
      {...original, content: "# Edited\n\n**Latest** content", updatedAt: "2026-01-01T12:00:00.000Z"},
      agent,
    ])
    await buttonWithIcon("chevron-left").trigger("click")
    expect(wrapper.text()).toContain("Latest content")
    const editButtons = wrapper.findAll("button").filter((button) => button.attributes("aria-label") === "Open comment")
    await editButtons[0].trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Agent edited")
    await buttonWithIcon("chevron-left").trigger("click")
    await flushPromises()

    expect(comments.commentsOf("task-1")[1]).toEqual({...agent, content: "Agent edited", updatedAt: "2026-01-01T12:00:00.000Z"})
    expect(comments.commentCountOf("task-1")).toBe(2)
    const activity = wrapper.text()
    expect(wrapper.findAll("[role=img][aria-label]").map((source) => source.attributes("aria-label"))).toEqual(["Daily Assistant", "claude"])
    expect(activity.indexOf("Agent edited")).toBeLessThan(activity.indexOf("Completed"))
    expect(activity.indexOf("Completed")).toBeLessThan(activity.indexOf("Latest content"))
    expect(activity.indexOf("Latest content")).toBeLessThan(activity.indexOf("Created"))
    expect(activity.match(/Created/g)).toHaveLength(1)
    expect(activity.match(/Completed/g)).toHaveLength(1)
    expect(window.BridgeIPC["tasks:update"]).not.toHaveBeenCalled()
  })

  it("returns on Esc with the current edit saved and the parent task draft still present", async () => {
    const {editor, comments} = await setup()
    editor.patch({content: "Unsaved parent change"})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Latest before returning")

    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true}))
    await flushPromises()

    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(comments.commentsOf("task-1")[0].content).toBe("Latest before returning")
    expect(editor.draft.content).toBe("Unsaved parent change")
    expect(editor.isOpen).toBe(true)
  })

  it("keeps a failed edit available and retries it when returning without blocking Back", async () => {
    const {comments} = await setup()
    const update = window.BridgeIPC["comments:update"]
    const save = update.getMockImplementation()
    update.mockRejectedValueOnce(new Error("Offline"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Retried content")
    await vi.advanceTimersByTimeAsync(400)

    expect(wrapper.find("[aria-label='Markdown content']").element.value).toBe("Retried content")
    expect(comments.commentsOf("task-1")[0].content).toBe("comment c1")
    expect(toasts.error).toHaveBeenCalledWith("Failed to edit the comment")

    let finish
    update.mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          finish = () => resolve(save(...args))
        }),
    )
    await buttonWithIcon("chevron-left").trigger("click")
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(comments.commentsOf("task-1")[0].content).toBe("comment c1")
    finish?.()
    await flushPromises()
    expect(comments.commentsOf("task-1")[0].content).toBe("Retried content")
  })

  it("returns to the parent and discards an unsent edit when the comment is deleted elsewhere", async () => {
    const {comments} = await setup()
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Must not return")

    comments.applyBroadcast({comments: {removed: ["c1"]}})
    await flushPromises()
    await vi.advanceTimersByTimeAsync(400)

    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(comments.commentsOf("task-1")).toEqual([])
    expect(window.BridgeIPC["comments:update"]).not.toHaveBeenCalled()
  })

  it("does not resurrect a comment when a save reply arrives after its external deletion", async () => {
    const {comments} = await setup()
    const update = window.BridgeIPC["comments:update"]
    const save = update.getMockImplementation()
    let finish
    update.mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          finish = () => resolve(save(...args))
        }),
    )
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("In flight")
    await vi.advanceTimersByTimeAsync(400)
    comments.applyBroadcast({comments: {removed: ["c1"]}})
    await flushPromises()
    finish()
    await flushPromises()

    expect(comments.commentsOf("task-1")).toEqual([])
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
  })

  it("serializes the last edit after an earlier save even when the same comment is reopened", async () => {
    const {comments} = await setup()
    const update = window.BridgeIPC["comments:update"]
    const save = update.getMockImplementation()
    let finish
    update.mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          finish = () => resolve(save(...args))
        }),
    )
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Earlier save")
    await vi.advanceTimersByTimeAsync(400)
    await buttonWithIcon("chevron-left").trigger("click")
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Last edit")
    await vi.advanceTimersByTimeAsync(400)
    finish()
    await flushPromises()

    expect(comments.commentsOf("task-1")[0].content).toBe("Last edit")
    expect(wrapper.find("[aria-label='Markdown content']").element.value).toBe("Last edit")
  })

  it("returns from a comment that storage can no longer update instead of keeping a stale target", async () => {
    const {comments} = await setup()
    window.BridgeIPC["comments:update"].mockResolvedValueOnce({})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Deleted in storage")
    await vi.advanceTimersByTimeAsync(400)

    await flushPromises()
    expect(comments.commentsOf("task-1")).toEqual([])
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
  })

  it("retries only the latest edit when an older failed save finishes after a newer edit was queued", async () => {
    const {comments} = await setup()
    let fail
    window.BridgeIPC["comments:update"].mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Older edit")
    await vi.advanceTimersByTimeAsync(400)
    await wrapper.find("[aria-label='Markdown content']").setValue("Latest edit")
    await vi.advanceTimersByTimeAsync(400)
    fail(new Error("Offline"))
    await flushPromises()
    await buttonWithIcon("chevron-left").trigger("click")
    await flushPromises()

    expect(comments.commentsOf("task-1")[0].content).toBe("Latest edit")
  })

  it.each([
    {key: "s", code: "KeyS"},
    {key: "Enter", code: "Enter"},
  ])("updates a pending comment immediately before the parent Cmd+$key shortcut", async ({key, code}) => {
    const {editor} = await setup([], {newTask: true})
    editor.patch({content: "New parent"})
    await wrapper.find("[aria-label='Write a comment']").setValue("Initial pending comment")
    await wrapper.find("[aria-label='Send comment']").trigger("click")
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    const written = []
    window.BridgeIPC["comments:create"] = vi.fn(async (taskId, content) => {
      const comment = makeComment("persisted", {taskId, content})
      written.push(comment)
      return {comments: {upserted: [comment]}}
    })
    const input = wrapper.find("[aria-label='Markdown content']")
    input.element.value = "Latest pending content"
    input.element.dispatchEvent(new Event("input", {bubbles: true}))
    expect(editor.pendingComments.map((comment) => comment.content)).toEqual(["Latest pending content"])
    window.dispatchEvent(new KeyboardEvent("keydown", {key, code, metaKey: true, cancelable: true}))
    await flushPromises()

    expect(written.map((comment) => comment.content)).toEqual(["Latest pending content"])
    expect(written[0].taskId).not.toBe("__draft__")
    expect(editor.isOpen).toBe(false)
  })

  it("keeps a newly opened comment visible when an older comment's deletion finishes", async () => {
    const {comments} = await setup([makeComment("c1"), makeComment("c2")])
    let finish
    window.BridgeIPC["comments:delete"] = vi.fn(
      (id) =>
        new Promise((resolve) => {
          finish = () => resolve({comments: {removed: [id]}})
        }),
    )
    await wrapper.findAll("button[aria-label='Open comment']")[1].trigger("click")
    await buttonWithIcon("trash").trigger("click")
    const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
    confirm.dispatchEvent(new Event("click", {bubbles: true}))
    await flushPromises()
    await buttonWithIcon("chevron-left").trigger("click")
    const editButtons = wrapper.findAll("button").filter((button) => button.attributes("aria-label") === "Open comment")
    await editButtons[0].trigger("click")
    finish()
    await flushPromises()

    expect(comments.commentsOf("task-1").map((comment) => comment.id)).toEqual(["c2"])
    expect(wrapper.findAll("[aria-label='Markdown content']").map((input) => input.element.value)).toEqual(["comment c2"])
  })

  it.each(["switching tasks", "closing the panel"])("flushes the last edit to the original task when %s", async (leaving) => {
    const other = makeComment("c2", {taskId: "task-2"})
    const {editor, comments} = await setup([makeComment("c1"), other])
    const update = window.BridgeIPC["comments:update"]
    const save = update.getMockImplementation()
    let finish
    update.mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          finish = () => resolve(save(...args))
        }),
    )
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("First version")
    await vi.advanceTimersByTimeAsync(400)
    await wrapper.find("[aria-label='Markdown content']").setValue("Final original edit")
    if (leaving === "closing the panel") editor.clear()
    await editor.open("task-2")
    await flushPromises()
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Other task edit")
    await vi.advanceTimersByTimeAsync(400)
    finish()
    await flushPromises()

    expect(comments.commentsOf("task-1")[0].content).toBe("Final original edit")
    expect(comments.commentsOf("task-2")[0].content).toBe("Other task edit")
    expect(wrapper.findAll("[aria-label='Markdown content']").map((input) => input.element.value)).toEqual(["Other task edit"])
  })

  it("keeps the local buffer through incoming edits and reads the newer version after reopening", async () => {
    const {comments} = await setup()
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Local text")
    comments.applyBroadcast({comments: {upserted: [makeComment("c1", {content: "Incoming text"})]}})
    await flushPromises()
    expect(wrapper.find("[aria-label='Markdown content']").element.value).toBe("Local text")
    await buttonWithIcon("chevron-left").trigger("click")
    await flushPromises()
    comments.applyBroadcast({comments: {upserted: [makeComment("c1", {content: "Newer remote text"})]}})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")

    expect(wrapper.find("[aria-label='Markdown content']").element.value).toBe("Newer remote text")
  })

  it("keeps the last nonempty version when the editor is cleared to whitespace", async () => {
    const {comments} = await setup()
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Last nonempty version")
    await wrapper.find("[aria-label='Markdown content']").setValue("  \n  ")
    await buttonWithIcon("chevron-left").trigger("click")
    await flushPromises()

    expect(comments.commentsOf("task-1")[0].content).toBe("Last nonempty version")
    expect(wrapper.text()).toContain("Last nonempty version")
  })

  it("leaves an Escape handled by the editor alone, then returns before closing the parent", async () => {
    const {editor} = await setup()
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    const escape = new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true})
    escape.preventDefault()
    window.dispatchEvent(escape)
    await flushPromises()
    expect(wrapper.findAll("[aria-label='Markdown content']").map((input) => input.element.value)).toEqual(["comment c1"])
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true}))
    await flushPromises()
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(editor.isOpen).toBe(true)
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true}))
    await flushPromises()
    expect(editor.isOpen).toBe(false)
  })

  it("dismisses an attachment modal on Escape while keeping the comment buffer until a later Escape", async () => {
    const {editor, comments} = await setup()
    const {default: CommentView} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/CommentView.vue")
    const {BaseModalProvider} = await import("../../../../src/renderer/src/ui/base/BaseModal")
    const {useImagePreviewModal} = await import("../../../../src/renderer/src/ui/overlays/ImagePreviewModal")
    modalProvider = mount(BaseModalProvider, {global: {directives: {tooltip: {}}, stubs: {transition: false}}})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Comment under the preview")
    useImagePreviewModal().open("data:image/png;base64,", "Attachment preview")
    await flushPromises()
    expect(document.body.querySelector("img[alt='Attachment preview']")).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))
    await flushPromises()

    expect(wrapper.findComponent(CommentView).exists()).toBe(true)
    expect(wrapper.findComponent(CommentView).find("[aria-label='Markdown content']").element.value).toBe("Comment under the preview")
    await vi.advanceTimersByTimeAsync(400)
    expect(document.body.querySelector("img[alt='Attachment preview']")).toBeNull()
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))
    await flushPromises()

    expect(wrapper.findComponent(CommentView).exists()).toBe(false)
    expect(comments.commentsOf("task-1")[0].content).toBe("Comment under the preview")
    expect(editor.isOpen).toBe(true)
  })

  it.each(["before deletion", "during deletion", "before returning during deletion"])(
    "saves the latest nonempty edit %s when deletion fails and Back returns immediately",
    async (edited) => {
      const {comments} = await setup()
      let fail
      window.BridgeIPC["comments:delete"] = vi.fn(
        () =>
          new Promise((_, reject) => {
            fail = reject
          }),
      )
      vi.spyOn(console, "error").mockImplementation(() => {})
      await wrapper.find("button[aria-label='Open comment']").trigger("click")
      await wrapper.find("[aria-label='Markdown content']").setValue("Latest surviving content")
      await buttonWithIcon("trash").trigger("click")
      const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
      confirm.dispatchEvent(new Event("click", {bubbles: true}))
      await flushPromises()
      if (edited !== "before deletion") {
        await wrapper.find("[aria-label='Markdown content']").setValue("Newer surviving content")
        await wrapper.find("[aria-label='Markdown content']").setValue("  \n  ")
      }
      if (edited === "before returning during deletion") {
        await buttonWithIcon("chevron-left").trigger("click")
        expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
      }
      fail(new Error("Offline"))
      await flushPromises()
      expect(toasts.error).toHaveBeenCalledWith("Failed to delete the comment")
      if (edited !== "before returning during deletion") await buttonWithIcon("chevron-left").trigger("click")
      await flushPromises()

      const expected = edited === "before deletion" ? "Latest surviving content" : "Newer surviving content"
      expect(comments.commentsOf("task-1")[0].content).toBe(expected)
      await wrapper.find("button[aria-label='Open comment']").trigger("click")
      expect(wrapper.find("[aria-label='Markdown content']").element.value).toBe(expected)
    },
  )

  it.each(["saved", "in flight", "returned to parent", "returned before autosave", "waiting for autosave", "panel reopened"])(
    "keeps the newer edit %s after reopening when an older deletion fails",
    async (newerEdit) => {
      const {comments, editor} = await setup()
      let failDelete
      window.BridgeIPC["comments:delete"] = vi.fn(
        () =>
          new Promise((_, reject) => {
            failDelete = reject
          }),
      )
      vi.spyOn(console, "error").mockImplementation(() => {})
      await wrapper.find("button[aria-label='Open comment']").trigger("click")
      await wrapper.find("[aria-label='Markdown content']").setValue("Older surviving edit")
      await buttonWithIcon("trash").trigger("click")
      const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
      confirm.dispatchEvent(new Event("click", {bubbles: true}))
      await flushPromises()
      await buttonWithIcon("chevron-left").trigger("click")
      if (newerEdit === "panel reopened") {
        editor.clear()
        await flushPromises()
        await editor.open("task-1")
        await flushPromises()
      }
      await wrapper.find("button[aria-label='Open comment']").trigger("click")
      let finishSave
      if (newerEdit === "in flight") {
        const update = window.BridgeIPC["comments:update"]
        const save = update.getMockImplementation()
        update.mockImplementationOnce(
          (...args) =>
            new Promise((resolve) => {
              finishSave = () => resolve(save(...args))
            }),
        )
      }
      await wrapper.find("[aria-label='Markdown content']").setValue("Newer surviving edit")
      const beforeAutosave = newerEdit === "returned before autosave" || newerEdit === "waiting for autosave"
      const returned = newerEdit === "returned to parent" || newerEdit === "returned before autosave"
      if (!beforeAutosave) await vi.advanceTimersByTimeAsync(400)
      if (!beforeAutosave && newerEdit !== "in flight") expect(comments.commentsOf("task-1")[0].content).toBe("Newer surviving edit")
      if (returned) await buttonWithIcon("chevron-left").trigger("click")
      failDelete(new Error("Offline"))
      await flushPromises()
      if (newerEdit === "waiting for autosave") {
        expect(comments.commentsOf("task-1")[0].content).toBe("comment c1")
        await vi.advanceTimersByTimeAsync(400)
      }
      finishSave?.()
      await flushPromises()

      expect(comments.commentsOf("task-1")[0].content).toBe("Newer surviving edit")
      if (!returned) await buttonWithIcon("chevron-left").trigger("click")
      await wrapper.find("button[aria-label='Open comment']").trigger("click")
      expect(wrapper.find("[aria-label='Markdown content']").element.value).toBe("Newer surviving edit")
    },
  )

  it("retains a failed in-flight save when deletion also fails", async () => {
    const {comments} = await setup()
    let failSave
    window.BridgeIPC["comments:update"].mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failSave = reject
        }),
    )
    window.BridgeIPC["comments:delete"] = vi.fn().mockRejectedValueOnce(new Error("Offline"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Failed in-flight content")
    await vi.advanceTimersByTimeAsync(400)
    await buttonWithIcon("trash").trigger("click")
    const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
    confirm.dispatchEvent(new Event("click", {bubbles: true}))
    await flushPromises()
    failSave(new Error("Offline"))
    await flushPromises()
    await buttonWithIcon("chevron-left").trigger("click")
    await flushPromises()

    expect(comments.commentsOf("task-1")[0].content).toBe("Failed in-flight content")
  })

  it("discards unsent changes when deletion is confirmed and returns to the parent", async () => {
    const {comments} = await setup()
    window.BridgeIPC["comments:delete"] = vi.fn(async (id) => ({comments: {removed: [id]}}))
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await wrapper.find("[aria-label='Markdown content']").setValue("Discard on deletion")
    await buttonWithIcon("trash").trigger("click")
    const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
    confirm.dispatchEvent(new Event("click", {bubbles: true}))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(400)

    expect(comments.commentsOf("task-1")).toEqual([])
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(wrapper.text()).toContain("No activity yet")
    expect(window.BridgeIPC["comments:update"]).not.toHaveBeenCalled()
  })

  it("can open and autosave a subtask after returning from a comment", async () => {
    const subtask = makeSubtask("s1")
    await setup([makeComment("c1")], {subtasks: [subtask]})
    window.BridgeIPC["subtasks:update"] = vi.fn(async (id, changes) => ({subtasks: {upserted: [{...subtask, ...changes}]}}))
    const {useSubtasksStore} = await import("../../../../src/renderer/src/stores/subtasks.store")
    await wrapper.find("button[aria-label='Open comment']").trigger("click")
    await buttonWithIcon("chevron-left").trigger("click")
    await buttonWithIcon("chevron-right").trigger("click")
    expect(wrapper.findAll("[aria-label='Markdown content']").map((input) => input.element.value)).toEqual(["Existing subtask"])
    await wrapper.find("[aria-label='Markdown content']").setValue("Updated subtask")
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", cancelable: true}))
    await flushPromises()

    expect(useSubtasksStore().subtasksOf("task-1")[0].content).toBe("Updated subtask")
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(wrapper.text()).toContain("Updated subtask")
  })

  it("returns if a comment disappears between Open comment and mounting its view", async () => {
    const {comments} = await setup()
    wrapper.find("button[aria-label='Open comment']").element.dispatchEvent(new Event("click", {bubbles: true}))
    comments.applyBroadcast({comments: {removed: ["c1"]}})
    await flushPromises()

    expect(comments.commentsOf("task-1")).toEqual([])
    expect(wrapper.findAll("[aria-label='Markdown content']")).toHaveLength(0)
    expect(wrapper.text()).toContain("No activity yet")
  })
})
