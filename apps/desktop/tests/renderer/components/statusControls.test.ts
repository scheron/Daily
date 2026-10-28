// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, expect, it} from "vitest"

import {groupTasksByDay} from "@daily/protocol"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeTask} from "../../helpers/taskFixtures"

const SRC = "../../../src/renderer/src"

beforeEach(() => {
  mockBridgeIPC()
  setActivePinia(createPinia())
})

it("offers search filters for every true status and emits Ready to Merge", async () => {
  const {default: Toolbar} = await import(`${SRC}/ui/overlays/SearchModal/{fragments}/SearchToolbar/SearchToolbar.vue`)
  const wrapper = mount(Toolbar, {
    props: {filterQuery: "", filterStatus: "all", searching: false, hasItems: true},
    global: {directives: {tooltip: {}}},
  })
  expect(wrapper.findAll("button[aria-label]").map((button) => button.attributes("aria-label"))).toEqual([
    "All statuses",
    "Backlog",
    "Ready for Agent",
    "In Progress",
    "Ready to Merge",
    "Done",
    "Cancelled",
  ])
  await wrapper.find("button[aria-label='Ready to Merge']").trigger("click")
  expect(wrapper.emitted("update:filter-status")).toEqual([["ready_to_merge"]])
  wrapper.unmount()
})

it("renders six real calendar counts in Agents and groups them in Normal", async () => {
  const {useSettingsStore} = await import(`${SRC}/stores/settings.store`)
  const settings = useSettingsStore()
  await new Promise((resolve) => setTimeout(resolve))
  settings.settings = {appearance: {boardMode: "agents"}}
  const {default: Calendar} = await import(`${SRC}/ui/common/calendar/TaskCalendar/TaskCalendar.vue`)
  const tasks = ["ready_for_agent", "ready_to_merge", "in_progress", "done", "cancelled"].map((status, i) =>
    makeTask({id: String(i), status, orderIndex: i}),
  )
  const wrapper = mount(Calendar, {
    props: {days: groupTasksByDay({tasks, tags: []}), selectedDate: "2030-01-02"},
    global: {directives: {tooltip: {}}},
  })
  const count = (label) => {
    const counter = wrapper.find(`[aria-label='${label}']`)
    return counter.exists() ? counter.text() : undefined
  }
  expect(count("Ready for Agent: 1")).toBe("1")
  expect(count("Ready to Merge: 1")).toBe("1")
  expect(count("Cancelled: 1")).toBe("1")
  settings.settings = {appearance: {boardMode: "normal"}}
  await wrapper.vm.$nextTick()
  expect(count("Backlog: 1")).toBe("1")
  expect(count("In Progress: 2")).toBe("2")
  expect(wrapper.find("[aria-label='Ready for Agent: 1']").exists()).toBe(false)
  wrapper.unmount()
})

it("lets a dated Ready task clear its day in the calendar", async () => {
  const {default: Calendar} = await import(`${SRC}/ui/common/calendar/TaskCalendar/TaskCalendar.vue`)
  const wrapper = mount(Calendar, {props: {days: [], selectedDate: "2030-01-02", allowClear: true}, global: {directives: {tooltip: {}}}})
  const clear = wrapper.findAll("button").find((button) => button.text() === "Clear date")
  expect(clear).toBeDefined()
  await clear.trigger("click")
  expect(wrapper.emitted("clear-date")).toEqual([[]])
  wrapper.unmount()
})
