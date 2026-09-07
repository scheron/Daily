// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@/api"
import {useTasksStore} from "@/stores/tasks/tasks.store"
import {flushPromises, mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

vi.mock("@/utils/ui/vue", () => ({
  toRawDeep: (v) => v,
}))

vi.mock("@/utils/perf", () => ({
  perfMark: vi.fn(),
  perfMeasure: vi.fn(),
}))

vi.mock("@/ui/modules/TaskBoard/{fragments}/TaskCard", () => ({
  default: {
    props: {task: {type: Object, required: true}, trashed: {type: Boolean, default: false}},
    template: `<div data-task-card-stub>{{ task.id }}</div>`,
  },
}))

vi.mock("@/ui/common/pickers/ViewPicker.vue", () => ({
  default: {
    props: ["modelValue", "options"],
    emits: ["update:modelValue"],
    template: `<div>
      <button v-for="opt in options" :key="opt.value" :data-view-option="opt.value" @click="$emit('update:modelValue', opt.value)">{{ opt.label }}</button>
    </div>`,
  },
}))

vi.mock("@/ui/overlays/ConfirmPopup", () => ({
  ConfirmPopup: {
    props: ["title", "message", "confirmText", "position", "contentClass"],
    emits: ["confirm"],
    template: `<div>
      <slot name="trigger" :show="() => {}" />
      <button data-confirm-popup-confirm @click="$emit('confirm')">confirm</button>
    </div>`,
  },
}))

vi.mock("@/api", () => ({
  API: {
    getDays: vi.fn().mockResolvedValue([]),
    getDay: vi.fn().mockResolvedValue(null),
    getBacklog: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    restoreTask: vi.fn().mockResolvedValue(null),
    permanentlyDeleteTask: vi.fn().mockResolvedValue(true),
    permanentlyDeleteAllDeletedTasks: vi.fn().mockResolvedValue(0),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue(null),
    scheduleTask: vi.fn().mockResolvedValue(null),
    moveTaskToBacklog: vi.fn().mockResolvedValue(null),
  },
}))

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    status: "backlog",
    content: "Test",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    tags: [],
    attachments: [],
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("SidebarColumn", () => {
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function mountSidebarColumn() {
    const {default: SidebarColumn} = await import("@/ui/modules/LeftPanel/{fragments}/SidebarColumn")
    wrapper = mount(SidebarColumn)
    return wrapper
  }

  async function switchToTrash(target) {
    await target.find('[data-view-option="trash"]').trigger("click")
    await flushPromises()
  }

  it("shows an empty-state explanation instead of a list when the backlog has nothing in it", async () => {
    API.getBacklog.mockResolvedValueOnce([])

    const wrapper = await mountSidebarColumn()
    await flushPromises()

    expect(wrapper.text()).toContain("No backlog tasks")
    expect(wrapper.findAll("[data-task-card]")).toHaveLength(0)
  })

  it("renders one card per backlog task, under a BACKLOG heading", async () => {
    API.getBacklog.mockResolvedValueOnce([makeTask({id: "b1"}), makeTask({id: "b2"})])

    const wrapper = await mountSidebarColumn()
    await flushPromises()

    expect(wrapper.text()).toContain("Backlog")
    expect(wrapper.findAll("[data-task-card]")).toHaveLength(2)
  })

  it("loads the backlog on mount", async () => {
    API.getBacklog.mockResolvedValueOnce([makeTask({id: "b1"})])

    await mountSidebarColumn()
    await flushPromises()

    const store = useTasksStore()
    expect(API.getBacklog).toHaveBeenCalledTimes(1)
    expect(store.backlogTasks.map((t) => t.id)).toEqual(["b1"])
  })

  it("switches to the Trash view and lists the deleted tasks, capped at 100, with an Empty action", async () => {
    API.getDeletedTasks.mockResolvedValueOnce([makeTask({id: "d1"}), makeTask({id: "d2"})])

    const wrapper = await mountSidebarColumn()
    await flushPromises()

    await switchToTrash(wrapper)

    expect(API.getDeletedTasks).toHaveBeenCalledWith({limit: 100, branchId: "main"})
    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(2)
    expect(wrapper.text()).toContain("Empty")
  })

  it("removes a card from the Trash list once it is restored or permanently deleted", async () => {
    API.getDeletedTasks.mockResolvedValueOnce([makeTask({id: "d1"}), makeTask({id: "d2"})])
    API.restoreTask.mockResolvedValueOnce(makeTask({id: "d1"}))
    API.permanentlyDeleteTask.mockResolvedValueOnce(true)

    const wrapper = await mountSidebarColumn()
    await flushPromises()
    await switchToTrash(wrapper)

    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(2)

    const store = useTasksStore()

    await store.restoreTask("d1")
    await flushPromises()
    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(1)

    await store.permanentlyDeleteTask("d2")
    await flushPromises()
    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(0)
  })

  it("empties the trash through the confirm action, clearing the list", async () => {
    API.getDeletedTasks.mockResolvedValueOnce([makeTask({id: "d1"}), makeTask({id: "d2"})])
    API.permanentlyDeleteAllDeletedTasks.mockResolvedValueOnce(2)

    const wrapper = await mountSidebarColumn()
    await flushPromises()
    await switchToTrash(wrapper)

    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(2)

    await wrapper.find("[data-confirm-popup-confirm]").trigger("click")

    expect(API.permanentlyDeleteAllDeletedTasks).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(0)
  })

  it("does not show the backlog's empty-state message while Trash is open and has tasks, even when the backlog itself is empty", async () => {
    API.getBacklog.mockResolvedValueOnce([])
    API.getDeletedTasks.mockResolvedValueOnce([makeTask({id: "d1"})])

    const wrapper = await mountSidebarColumn()
    await flushPromises()

    await switchToTrash(wrapper)

    expect(wrapper.findAll("[data-task-card-stub]")).toHaveLength(1)
    expect(wrapper.text()).not.toContain("No backlog tasks")
  })
})
