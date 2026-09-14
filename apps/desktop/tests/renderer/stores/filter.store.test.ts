// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it} from "vitest"

import {useFilterStore} from "../../../src/renderer/src/stores/filter.store"
import {useMilestonesStore} from "../../../src/renderer/src/stores/milestones.store"
import {useSettingsStore} from "../../../src/renderer/src/stores/settings.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

function makeMilestone(overrides = {}) {
  return {
    id: "milestone-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    name: "Launch",
    description: "",
    targetDate: null,
    orderIndex: 1024,
    progress: {total: 0, resolved: 0},
    ...overrides,
  }
}

describe("filterStore", () => {
  let store

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    store = useFilterStore()
  })

  it("setActiveTags toggles tag in set", () => {
    store.setActiveTags("tag-1")
    expect(store.activeTagIds.has("tag-1")).toBe(true)

    store.setActiveTags("tag-1")
    expect(store.activeTagIds.has("tag-1")).toBe(false)
  })

  it("clearActiveTags empties the set", () => {
    store.setActiveTags("tag-1")
    store.setActiveTags("tag-2")

    store.clearActiveTags()

    expect(store.activeTagIds.size).toBe(0)
  })

  it("reads_TC-4_the_frame_as_its_own_state_and_the_selected_milestone_as_a_filter_inside_it", () => {
    expect(store.frame).toBe("day")

    store.setFrame("milestone")
    expect(store.frame).toBe("milestone")
    expect(store.activeMilestoneId).toBeNull()

    store.setActiveMilestone("milestone-1")
    expect(store.activeMilestoneId).toBe("milestone-1")
    expect(store.frame).toBe("milestone")

    store.setActiveMilestone("milestone-1")
    expect(store.activeMilestoneId).toBeNull()
    expect(store.frame).toBe("milestone")

    store.setFrame("day")
    expect(store.frame).toBe("day")
  })

  it("clears_TC-5_the_selection_when_the_active_project_changes", async () => {
    const settingsStore = useSettingsStore()
    await new Promise((r) => setTimeout(r, 0))

    store.setFrame("milestone")
    store.setActiveMilestone("milestone-1")
    expect(store.frame).toBe("milestone")

    settingsStore.updateSettings({branch: {activeId: "other-branch"}})
    await nextTick()

    expect(store.activeMilestoneId).toBeNull()
    expect(store.frame).toBe("milestone")
  })

  it("clears_TC-5_the_selection_when_the_milestone_leaves_the_loaded_list", async () => {
    const milestonesStore = useMilestonesStore()
    await new Promise((r) => setTimeout(r, 0))

    milestonesStore.milestones = [makeMilestone({id: "milestone-1"})]
    milestonesStore.isMilestonesLoaded = true
    await nextTick()

    store.setActiveMilestone("milestone-1")
    expect(store.activeMilestoneId).toBe("milestone-1")

    milestonesStore.milestones = []
    await nextTick()

    expect(store.activeMilestoneId).toBeNull()
  })
})
