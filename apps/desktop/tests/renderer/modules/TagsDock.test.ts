// @vitest-environment happy-dom
// @ts-nocheck
import {effectScope, nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {makeTask, TODAY} from "../../helpers/boardDrag"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

describe("TagsDock — the all-projects mode", () => {
  it("clears_the_filter_by_name_after_the_chip_changes_its_id", async () => {
    mockBridgeIPC()
    setActivePinia(createPinia())

    const {default: TagsDock} = await import("../../../src/renderer/src/ui/modules/TagsDock.vue")
    const {default: DynamicTagsPanel} = await import("../../../src/renderer/src/ui/common/misc/DynamicTagsPanel.vue")
    const {useSettingsStore} = await import("../../../src/renderer/src/stores/settings.store")
    const {useTasksStore} = await import("../../../src/renderer/src/stores/tasks/tasks.store")
    const {useFilterStore} = await import("../../../src/renderer/src/stores/filter.store")
    const {useTaskColumns} = await import("../../../src/renderer/src/composables/tasks/useTaskColumns")

    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 20))
    settingsStore.settings = {branch: {activeId: "main", isAllProjects: true}, layout: {sectionsCollapsed: {}}}

    const tasks = useTasksStore()
    tasks.activeDay = TODAY
    tasks.tasks = [
      makeTask("A", {orderIndex: 1000, tags: [{id: "t-main", name: "work", color: "#000", branchId: "main"}]}),
      makeTask("B", {branchId: "leki", orderIndex: 2000, tags: [{id: "t-leki", name: "work", color: "#000", branchId: "leki"}]}),
      makeTask("C", {orderIndex: 3000, tags: []}),
    ]

    const wrapper = mount(TagsDock, {global: {directives: {tooltip: {}}}})
    await nextTick()
    const panel = () => wrapper.findComponent(DynamicTagsPanel)
    const filter = useFilterStore()

    panel().vm.$emit("select", panel().props("tags")[0].id)
    await nextTick()

    tasks.tasks = tasks.tasks.map((task) => (task.id === "B" ? {...task, orderIndex: 500} : task))
    await nextTick()
    await nextTick()
    const chip = panel().props("tags")[0]

    expect(chip.id).toBe("t-leki")
    expect(panel().props("selectedTags").has(chip.id)).toBe(true)

    panel().vm.$emit("select", chip.id)
    await nextTick()

    expect(filter.activeTagIds.size).toBe(0)
    const scope = effectScope()
    const shown = scope.run(() => Object.values(useTaskColumns().tasksByStatus.value).flat())
    scope.stop()
    expect(shown.map((task) => task.id).sort()).toEqual(["A", "B", "C"])
    wrapper.unmount()
  })
})

describe.each(["normal", "agents"])("TagsDock day queue in %s", (boardMode) => {
  it.each([false, true])("keeps an undated Ready task's chip and selected filter across preparation, all projects: %s", async (allProjects) => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    const {default: TagsDock} = await import("../../../src/renderer/src/ui/modules/TagsDock.vue")
    const {default: DynamicTagsPanel} = await import("../../../src/renderer/src/ui/common/misc/DynamicTagsPanel.vue")
    const {useSettingsStore} = await import("../../../src/renderer/src/stores/settings.store")
    const {useTasksStore} = await import("../../../src/renderer/src/stores/tasks/tasks.store")
    const {useFilterStore} = await import("../../../src/renderer/src/stores/filter.store")
    const {useTaskColumns} = await import("../../../src/renderer/src/composables/tasks/useTaskColumns")
    const settings = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 20))
    settings.settings = {branch: {activeId: "main", isAllProjects: allProjects}, layout: {sectionsCollapsed: {}}, appearance: {boardMode}}
    const tasks = useTasksStore()
    tasks.activeDay = TODAY
    const tag = (id, branchId = "main") => ({id, name: id, color: "#000", branchId})
    const otherDay = "2099-12-31"
    tasks.tasks = [
      makeTask("queue", {status: "backlog", scheduled: null, tags: [tag("Only queue")]}),
      makeTask("today", {tags: [tag("Today")]}),
      makeTask("tomorrow", {status: "ready_for_agent", scheduled: {date: otherDay, time: "09:00:00", timezone: "UTC"}, tags: [tag("Other day")]}),
      makeTask("other-project", {branchId: "other", status: "ready_for_agent", scheduled: null, tags: [tag("Other project", "other")]}),
    ]
    const wrapper = mount(TagsDock, {global: {directives: {tooltip: {}}}})
    try {
      await nextTick()
      const panel = () => wrapper.findComponent(DynamicTagsPanel)
      panel().vm.$emit("select", "Only queue")
      await nextTick()
      tasks.tasks = tasks.tasks.map((task) => (task.id === "queue" ? {...task, status: "ready_for_agent"} : task))
      await nextTick()
      const names = panel()
        .props("tags")
        .map((tag) => tag.name)
        .sort()
      expect(names).toEqual(allProjects ? ["Only queue", "Other project", "Today"] : ["Only queue", "Today"])
      expect([...useFilterStore().activeTagIds]).toEqual(["Only queue"])
      expect(panel().props("selectedTags").has("Only queue")).toBe(true)
      const scope = effectScope()
      const shown = scope.run(() =>
        Object.values(useTaskColumns().tasksByStatus.value)
          .flat()
          .map((task) => task.id),
      )
      scope.stop()
      expect(shown).toEqual(["queue"])
    } finally {
      wrapper.unmount()
    }
  })
})
