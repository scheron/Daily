// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"

describe("useLeftPanelLayout", () => {
  beforeEach(() => {
    localStorage.clear()
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  async function getLayout() {
    const {useLeftPanelLayout} = await import("@renderer/stores/ui/composables/useLeftPanelLayout")
    return useLeftPanelLayout()
  }

  it("defaults to month / stats / activity", async () => {
    const layout = await getLayout()
    expect(layout.slots.value.map((s) => s.id)).toEqual(["calendar-month", "stats", "activity"])
  })

  it("setSlotWidget replaces the widget but keeps the height", async () => {
    const layout = await getLayout()
    const h = layout.slots.value[0].height
    layout.setSlotWidget(0, "calendar-week")
    expect(layout.slots.value[0].id).toBe("calendar-week")
    expect(layout.slots.value[0].height).toBe(h)
  })

  it("setSlotHeight changes only that slot's height", async () => {
    const layout = await getLayout()
    layout.setSlotHeight(1, 999)
    expect(layout.slots.value[1].height).toBe(999)
    expect(layout.slots.value[0].id).toBe("calendar-month")
  })

  describe("addSlot", () => {
    it("appends a new slot with the given id and height", async () => {
      const layout = await getLayout()
      layout.addSlot("calendar-week", 160)
      expect(layout.slots.value).toHaveLength(4)
      expect(layout.slots.value[3].id).toBe("calendar-week")
      expect(layout.slots.value[3].height).toBe(160)
      expect(layout.slots.value[0].id).toBe("calendar-month")
      expect(layout.slots.value[1].id).toBe("stats")
      expect(layout.slots.value[2].id).toBe("activity")
    })
  })

  describe("removeSlot", () => {
    it("removes the slot at the given index", async () => {
      const layout = await getLayout()
      layout.removeSlot(1)
      expect(layout.slots.value).toHaveLength(2)
      expect(layout.slots.value.map((s) => s.id)).toEqual(["calendar-month", "activity"])
    })

    it("is a no-op when index is out of range", async () => {
      const layout = await getLayout()
      layout.removeSlot(99)
      expect(layout.slots.value).toHaveLength(3)
    })
  })

  describe("moveSlot", () => {
    it("moves the first slot to the end", async () => {
      const layout = await getLayout()
      layout.moveSlot(0, 2)
      expect(layout.slots.value.map((s) => s.id)).toEqual(["stats", "activity", "calendar-month"])
    })

    it("moves the last slot to the front", async () => {
      const layout = await getLayout()
      layout.moveSlot(2, 0)
      expect(layout.slots.value.map((s) => s.id)).toEqual(["activity", "calendar-month", "stats"])
    })

    it("is a no-op when toIndex is out of range", async () => {
      const layout = await getLayout()
      layout.moveSlot(0, 99)
      expect(layout.slots.value.map((s) => s.id)).toEqual(["calendar-month", "stats", "activity"])
    })
  })
})
