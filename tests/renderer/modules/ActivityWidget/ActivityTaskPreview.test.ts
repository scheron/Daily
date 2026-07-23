import {defineComponent, h, ref} from "vue"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import ActivityTaskPreview from "@/ui/modules/LeftPanel/{fragments}/ActivityWidget/{fragments}/ActivityTaskPreview.vue"

import {API} from "@/api"
import {flushPromises, mount} from "@vue/test-utils"

import type {Task} from "@shared/types/storage"

vi.mock("@/api", () => ({
  API: {
    getTask: vi.fn(),
  },
}))

const BasePopupStub = defineComponent({
  setup(_, {slots}) {
    const isOpen = ref(false)
    const show = () => {
      isOpen.value = true
    }

    return () => h("div", [slots.trigger?.({show}), isOpen.value ? h("div", {"data-popup": ""}, slots.default?.()) : null])
  },
})

const ActivityTaskPreviewCardStub = defineComponent({
  props: {task: {type: Object, required: true}},
  template: "<div data-task-preview-card />",
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })

  return {promise, resolve}
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    createdAt: "2026-07-23T09:00:00.000Z",
    updatedAt: "2026-07-23T09:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    scheduled: {date: "2026-07-23", time: "09:00:00", timezone: "Asia/Vladivostok"},
    estimatedTime: 0,
    spentTime: 0,
    content: "Preview task",
    minimized: false,
    orderIndex: 0,
    status: "active",
    tags: [],
    attachments: [],
    ...overrides,
  }
}

describe("ActivityTaskPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  function mountPreview(props: {isDeleted?: boolean} = {}) {
    return mount(ActivityTaskPreview, {
      props: {taskId: "task-1", ...props},
      slots: {
        trigger: ({show, cancel, open}: {show: () => void; cancel: () => void; open: () => void}) =>
          h("button", {onMouseenter: show, onMouseleave: cancel, onClick: open}, "#task-1"),
      },
      global: {
        stubs: {
          BasePopup: BasePopupStub,
          ActivityTaskPreviewCard: ActivityTaskPreviewCardStub,
        },
      },
    })
  }

  it("loads and displays a task on hover while preserving the task-link click", async () => {
    vi.mocked(API.getTask).mockResolvedValue(makeTask())
    const wrapper = mountPreview()

    await wrapper.get("button").trigger("mouseenter")
    await vi.advanceTimersByTimeAsync(150)
    await flushPromises()

    expect(API.getTask).toHaveBeenCalledWith("task-1")
    expect(wrapper.find("[data-task-preview-card]").exists()).toBe(true)

    await wrapper.get("button").trigger("click")
    expect(wrapper.emitted("open")).toHaveLength(1)
  })

  it("shows a deleted-task tooltip for soft-deleted tasks", async () => {
    vi.mocked(API.getTask).mockResolvedValue(makeTask({deletedAt: "2026-07-23T10:00:00.000Z"}))
    const wrapper = mountPreview()

    await wrapper.get("button").trigger("mouseenter")
    await vi.advanceTimersByTimeAsync(150)
    await flushPromises()

    expect(API.getTask).toHaveBeenCalledWith("task-1")
    expect(wrapper.find("[data-task-preview-card]").exists()).toBe(false)
    expect(wrapper.find("[data-popup]").text()).toContain("Task deleted")
  })

  it("shows a deleted-task tooltip without loading a deleted activity event", async () => {
    const wrapper = mountPreview({isDeleted: true})

    await wrapper.get("button").trigger("mouseenter")
    await flushPromises()

    expect(API.getTask).not.toHaveBeenCalled()
    expect(wrapper.find("[data-popup]").text()).toContain("Task deleted")
  })

  it("cancels a pending request when another task link is hovered", async () => {
    vi.mocked(API.getTask).mockResolvedValue(makeTask({id: "task-2"}))

    const wrapper = mount(
      defineComponent({
        setup() {
          const taskLink =
            (id: string) =>
            ({show, cancel}: {show: () => void; cancel: () => void}) =>
              h("button", {"data-task-id": id, onMouseenter: show, onMouseleave: cancel}, `#${id}`)

          return () =>
            h("div", [
              h(ActivityTaskPreview, {taskId: "task-1"}, {trigger: taskLink("task-1")}),
              h(ActivityTaskPreview, {taskId: "task-2"}, {trigger: taskLink("task-2")}),
            ])
        },
      }),
      {
        global: {
          stubs: {
            BasePopup: BasePopupStub,
            ActivityTaskPreviewCard: ActivityTaskPreviewCardStub,
          },
        },
      },
    )

    await wrapper.get('[data-task-id="task-1"]').trigger("mouseenter")
    await wrapper.get('[data-task-id="task-2"]').trigger("mouseenter")
    await vi.advanceTimersByTimeAsync(150)
    await flushPromises()

    expect(API.getTask).toHaveBeenCalledTimes(1)
    expect(API.getTask).toHaveBeenCalledWith("task-2")
  })

  it("does not request a task when the pointer leaves before the hover delay", async () => {
    const wrapper = mountPreview()

    await wrapper.get("button").trigger("mouseenter")
    await wrapper.get("button").trigger("mouseleave")
    await vi.advanceTimersByTimeAsync(150)

    expect(API.getTask).not.toHaveBeenCalled()
    expect(wrapper.find("[data-popup]").exists()).toBe(false)
  })

  it("ignores a task response after the pointer has left the link", async () => {
    const pendingTask = deferred<Task>()
    vi.mocked(API.getTask).mockReturnValue(pendingTask.promise)
    const wrapper = mountPreview()

    await wrapper.get("button").trigger("mouseenter")
    await vi.advanceTimersByTimeAsync(150)
    expect(API.getTask).toHaveBeenCalledWith("task-1")

    await wrapper.get("button").trigger("mouseleave")
    pendingTask.resolve(makeTask())
    await flushPromises()

    expect(wrapper.find("[data-task-preview-card]").exists()).toBe(false)
    expect(wrapper.find("[data-popup]").exists()).toBe(false)
  })
})
