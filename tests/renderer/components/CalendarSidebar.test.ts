// @ts-nocheck
import {nextTick} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {dropTargetDate} from "@renderer/composables/useDayDropTarget"
import {useTasksStore} from "@renderer/stores/tasks.store"
import CalendarSidebar from "@renderer/ui/views/Main/{fragments}/Sidebar/CalendarSidebar.vue"
import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()

vi.mock("@renderer/utils/ui/vue", () => ({toRawDeep: (v) => v}))
vi.mock("@renderer/utils/perf", () => ({perfMark: vi.fn(), perfMeasure: vi.fn()}))
vi.mock("@renderer/api", () => ({
  API: {
    getDays: vi.fn().mockResolvedValue([]),
    getDay: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue(null),
  },
}))

describe("CalendarSidebar", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountSidebar(days = []) {
    API.getDays.mockResolvedValueOnce(days)
    const store = useTasksStore()
    await new Promise((r) => setTimeout(r, 0))
    await store.getTaskList()
    const wrapper = mount(CalendarSidebar, {props: {activeDay: TODAY}})
    return {store, wrapper}
  }

  it("renders every loaded date exactly once, including today", async () => {
    const {wrapper} = await mountSidebar()
    const cells = wrapper.findAll("[data-drop-day]")

    expect(cells.length).toBeGreaterThan(0)

    const dates = cells.map((cell) => cell.attributes("data-drop-day"))
    expect(new Set(dates).size).toBe(dates.length)
    expect(dates).toContain(TODAY)
  })

  it("renders a section per month with task counts in the header", async () => {
    const day = {date: TODAY, tasks: [{id: "t1", status: "active", tags: []}], tags: [], countActive: 1, countDone: 0}
    const {wrapper} = await mountSidebar([day])

    const currentMonthKey = TODAY.slice(0, 7)
    const section = wrapper.find(`[data-month="${currentMonthKey}"]`)
    expect(section.exists()).toBe(true)
    expect(section.find("h3").exists()).toBe(true)
    expect(section.find(".text-error").text()).toBe("1")
    expect(section.find(".text-warning").text()).toBe("0")
    expect(section.find(".text-success").text()).toBe("0")

    const sections = wrapper.findAll("[data-month]")
    expect(sections.length).toBeGreaterThanOrEqual(12) // ±6 months loaded
  })

  it("selects a day on click", async () => {
    const {store, wrapper} = await mountSidebar()
    const target = DateTime.now().plus({days: 1}).toISODate()

    await wrapper.find(`[data-drop-day="${target}"]`).trigger("click")

    expect(store.activeDay).toBe(target)
  })

  it("shows a warning dot for active days and a success dot for completed days", async () => {
    const activeDay = {date: TODAY, tasks: [{id: "t1", status: "active", tags: []}], tags: [], countActive: 1, countDone: 0}
    const doneDate = DateTime.now().plus({days: 2}).toISODate()
    const doneDay = {date: doneDate, tasks: [{id: "t2", status: "done", tags: []}], tags: [], countActive: 0, countDone: 1}

    const {wrapper} = await mountSidebar([activeDay, doneDay])

    expect(wrapper.find(`[data-drop-day="${TODAY}"] .bg-warning`).exists()).toBe(true)
    expect(wrapper.find(`[data-drop-day="${doneDate}"] .bg-success`).exists()).toBe(true)
  })

  it("highlights the drop target cell with a ring", async () => {
    const {wrapper} = await mountSidebar()
    const target = DateTime.now().plus({days: 3}).toISODate()

    dropTargetDate.value = target
    await nextTick()

    expect(wrapper.find(`[data-drop-day="${target}"]`).classes()).toContain("ring-accent")

    dropTargetDate.value = null
  })
})
