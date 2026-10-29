// @vitest-environment happy-dom
import {defineComponent, h, nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, expect, it, vi} from "vitest"

import {enableAutoUnmount, flushPromises, mount} from "@vue/test-utils"
import {useSettingsStore} from "../../../../src/renderer/src/stores/settings.store"
import {useTaskEditorStore} from "../../../../src/renderer/src/stores/task-editor"
import {useTasksStore} from "../../../../src/renderer/src/stores/tasks"
import StatusSelector from "../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Details/{fragments}/StatusSelector.vue"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {makeTask} from "../../../helpers/taskFixtures"

import type {TaskStatus} from "@daily/protocol"

enableAutoUnmount(afterEach)

beforeEach(() => {
  mockBridgeIPC({"tasks:update": vi.fn().mockResolvedValue({})})
  setActivePinia(createPinia())
})

async function setup(status: TaskStatus) {
  const settings = useSettingsStore()
  await flushPromises()
  const tasks = useTasksStore()
  const task = makeTask({status})
  tasks.tasks = [task]
  const editor = useTaskEditorStore()
  await editor.open(task.id)
  editor.patch({content: "Unsaved work"})
  const wrapper = mount(
    defineComponent({
      setup() {
        return () => h(StatusSelector, {task: {...task, ...editor.draft, branchId: editor.draft?.branchId ?? task.branchId}})
      },
    }),
  )
  return {wrapper, settings, tasks, editor}
}

it.each([
  {status: "ready_for_agent" as const, groupedLabel: "Backlog", actualLabel: "Ready for Agent"},
  {status: "ready_to_merge" as const, groupedLabel: "In Progress", actualLabel: "Ready to Merge"},
])(
  "groups $status in Default and restores its true selection in Agents without changing the task or draft",
  async ({status, groupedLabel, actualLabel}) => {
    const {wrapper, settings, tasks, editor} = await setup(status)
    const storedTask = makeTask({status})
    const draft = editor.draft

    expect(wrapper.findAll("button").map((button) => button.text())).toEqual(["Backlog", "In Progress", "Done", "Cancelled"])
    expect(wrapper.findAll("button[aria-pressed=true]").map((button) => button.text())).toEqual([groupedLabel])

    settings.updateSettings({appearance: {boardMode: "agents"}})
    await nextTick()

    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "Backlog",
      "Ready for Agent",
      "In Progress",
      "Ready to Merge",
      "Done",
      "Cancelled",
    ])
    expect(wrapper.findAll("button[aria-pressed=true]").map((button) => button.text())).toEqual([actualLabel])

    settings.updateSettings({appearance: {boardMode: "normal"}})
    await nextTick()

    expect(wrapper.findAll("button[aria-pressed=true]").map((button) => button.text())).toEqual([groupedLabel])
    expect(tasks.tasks).toEqual([storedTask])
    expect(editor.draft).toBe(draft)
    expect(editor.draft).toMatchObject({status, scheduled: {date: "2030-01-02"}, content: "Unsaved work"})
    expect(editor.isDirty).toBe(true)
    await settings.flush()
  },
)

it("keeps an actual status click unchanged and commits an explicit Backlog choice from grouped readiness with its day cleared", async () => {
  const {wrapper, settings, tasks, editor} = await setup("ready_for_agent")
  settings.updateSettings({appearance: {boardMode: "agents"}})
  await nextTick()
  const draft = editor.draft

  await wrapper.get("button[title='Ready for Agent']").trigger("click")

  expect(editor.draft).toBe(draft)

  settings.updateSettings({appearance: {boardMode: "normal"}})
  await nextTick()
  await wrapper.get("button[title=Backlog]").trigger("click")

  expect(editor.draft).toMatchObject({status: "backlog", scheduled: null, content: "Unsaved work"})
  expect(tasks.tasks[0]).toMatchObject({status: "ready_for_agent", scheduled: {date: "2030-01-02"}, orderIndex: 1024})

  await editor.commit()

  expect(tasks.tasks[0]).toMatchObject({status: "backlog", scheduled: null, content: "Unsaved work", orderIndex: 1024})
  expect(editor.isDirty).toBe(false)
  await settings.flush()
})
