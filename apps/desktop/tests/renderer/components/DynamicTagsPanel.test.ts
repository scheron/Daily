// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {installFakeResizeObserver, stubLayout} from "../../helpers/resizeObserver"

const {deliverResizeToObserved} = installFakeResizeObserver()

function makeTag(overrides = {}) {
  return {
    id: "tag-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    name: "tag",
    color: "#888888",
    ...overrides,
  }
}

async function settle() {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await nextTick()
}

describe("DynamicTagsPanel", () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  it("fits_TC-10_as_many_tags_as_the_container_allows_and_shows_nothing_before_the_first_measurement", async () => {
    const {default: DynamicTagsPanel} = await import("../../../src/renderer/src/ui/common/misc/DynamicTagsPanel.vue")

    const tags = [
      makeTag({id: "tag-1", name: "one"}),
      makeTag({id: "tag-2", name: "two"}),
      makeTag({id: "tag-3", name: "three"}),
      makeTag({id: "tag-4", name: "four"}),
    ]

    wrapper = mount(DynamicTagsPanel, {props: {tags}, global: {directives: {tooltip: {}}}, attachTo: document.body})
    await nextTick()

    const containerEl = wrapper.element
    const measureEl = containerEl.querySelector(".pointer-events-none")
    const rowEl = Array.from(containerEl.children).find((el) => el !== measureEl)
    if (!measureEl || !rowEl) throw new Error("expected a measure row and a visible row")

    function visibleTagButtons() {
      return Array.from(rowEl.querySelectorAll("button.base-tag"))
    }
    function moreButton() {
      return Array.from(rowEl.querySelectorAll("button")).find((button) => !button.classList.contains("base-tag")) ?? null
    }

    expect(visibleTagButtons()).toHaveLength(0)
    expect(moreButton()).toBeNull()

    Array.from(measureEl.children).forEach((child) => stubLayout(child, {offsetWidth: 50}))

    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, ...rest) => {
      if (element === rowEl) {
        return {paddingLeft: "0px", paddingRight: "0px", borderLeftWidth: "0px", borderRightWidth: "0px", columnGap: "8px"}
      }
      return realGetComputedStyle(element, ...rest)
    })

    async function settleAtWidth(width) {
      stubLayout(containerEl, {offsetWidth: width})
      deliverResizeToObserved()
      await settle()
    }

    await settleAtWidth(200)
    expect(visibleTagButtons()).toHaveLength(2)
    expect(moreButton()?.textContent.trim()).toBe("+2")

    await settleAtWidth(120)
    expect(visibleTagButtons()).toHaveLength(1)
    expect(moreButton()?.textContent.trim()).toBe("+3")

    await settleAtWidth(0)
    expect(visibleTagButtons()).toHaveLength(0)
    expect(moreButton()?.textContent.trim()).toBe("+4")
  })
})
