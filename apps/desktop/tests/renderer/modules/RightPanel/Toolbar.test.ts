// @vitest-environment happy-dom
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {enableAutoUnmount, mount} from "@vue/test-utils"
import {useTaskEditorStore} from "../../../../src/renderer/src/stores/task-editor"
import {useTasksStore} from "../../../../src/renderer/src/stores/tasks"
import Toolbar from "../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Toolbar.vue"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {stubClipboard} from "../../../helpers/clipboard"
import {makeSubtask, makeTask} from "../../../helpers/taskFixtures"

enableAutoUnmount(afterEach)

describe("RightPanel Toolbar", () => {
  const clipboard = stubClipboard()
  const tooltips = new WeakMap<Element, string>()

  const tooltipDirective = {
    mounted(el: Element, binding: {value?: {content?: unknown} | string}) {
      const text = typeof binding.value === "string" ? binding.value : binding.value?.content
      if (typeof text === "string") tooltips.set(el, text)
    },
    updated(el: Element, binding: {value?: {content?: unknown} | string}) {
      const text = typeof binding.value === "string" ? binding.value : binding.value?.content
      if (typeof text === "string") tooltips.set(el, text)
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mountToolbar(title = "Ship") {
    return mount(Toolbar, {
      props: {title},
      global: {
        directives: {tooltip: tooltipDirective},
      },
    })
  }

  function buttonWithTooltip(wrapper: ReturnType<typeof mountToolbar>, label: string) {
    return wrapper.findAll("button").find((button) => tooltips.get(button.element) === label)
  }

  it("replaces Copy Task Content with Copy Task, hands real editingTaskId to useCopyTask, toggles check icon, and toasts [task-copy#yaml-structure]", async () => {
    vi.useFakeTimers()
    const bridge = mockBridgeIPC({
      "subtasks:get-by-task": vi
        .fn()
        .mockResolvedValue([
          makeSubtask({id: "sub-2", taskId: "task-42", content: "Second", done: true, orderKey: "b"}),
          makeSubtask({id: "sub-1", taskId: "task-42", content: "First", done: false, orderKey: "a"}),
        ]),
    })

    const tasksStore = useTasksStore()
    const task = makeTask({id: "task-42", content: "# Ship\n\nBody"})
    tasksStore.tasks = [task]
    const taskEditorStore = useTaskEditorStore()
    await taskEditorStore.open("task-42")

    const wrapper = mountToolbar("Ship")
    await nextTick()

    expect(buttonWithTooltip(wrapper, "Copy Task ID")).toBeDefined()
    expect(buttonWithTooltip(wrapper, "Copy Task Content")).toBeUndefined()

    const copyButton = buttonWithTooltip(wrapper, "Copy Task")
    expect(copyButton).toBeDefined()
    expect(copyButton!.find("use").attributes("href")).toBe("#copy")

    await copyButton!.trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()

    expect(clipboard.read()).toBe(
      "version: 1\nid: task-42\ncontent: |-\n  # Ship\n\n  Body\nsubtasks:\n  - id: sub-1\n    done: false\n    content: First\n  - id: sub-2\n    done: true\n    content: Second\n",
    )
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "success", message: "Task copied to clipboard"})
    expect(copyButton!.find("use").attributes("href")).toBe("#check")

    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()

    expect(copyButton!.find("use").attributes("href")).toBe("#copy")
  })

  it("blocks copying from the toolbar when the open task has unsaved edits [task-copy#blocks-unsaved-draft]", async () => {
    vi.useFakeTimers()
    const getSubtasks = vi.fn().mockResolvedValue([])
    const bridge = mockBridgeIPC({"subtasks:get-by-task": getSubtasks})

    const tasksStore = useTasksStore()
    tasksStore.tasks = [makeTask({id: "task-42", content: "Saved"})]
    const taskEditorStore = useTaskEditorStore()
    await taskEditorStore.open("task-42")
    taskEditorStore.patch({content: "Unsaved edit"})

    const wrapper = mountToolbar("Unsaved edit")
    await nextTick()

    const copyButton = buttonWithTooltip(wrapper, "Copy Task")
    expect(copyButton).toBeDefined()

    await copyButton!.trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()

    expect(clipboard.read()).toBeNull()
    expect(getSubtasks).not.toHaveBeenCalled()
    expect(copyButton!.find("use").attributes("href")).toBe("#copy")
    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "info", message: "Save changes before copying task"})
  })

  it("hides Copy Task ID and Copy Task when composing a new unsaved task", async () => {
    mockBridgeIPC()
    const taskEditorStore = useTaskEditorStore()
    taskEditorStore.openNew({branchId: "main", milestoneId: null})

    const wrapper = mountToolbar("")
    await nextTick()

    expect(buttonWithTooltip(wrapper, "Copy Task ID")).toBeUndefined()
    expect(buttonWithTooltip(wrapper, "Copy Task")).toBeUndefined()
  })
})
