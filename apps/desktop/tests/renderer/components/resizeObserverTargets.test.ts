// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {installFakeResizeObserver, stubLayout} from "../../helpers/resizeObserver"

const {deliverResize} = installFakeResizeObserver()

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

describe("resize observer targets", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  it("clamps MarkdownContent from a delivery on .cm-content, not one on its own root", async () => {
    const {default: MarkdownContent} = await import("../../../src/renderer/src/ui/common/misc/MarkdownContent.vue")

    wrapper = mount(MarkdownContent, {props: {content: "text"}, attachTo: document.body})
    await nextTick()

    const contentEl = wrapper.element.querySelector(".cm-content")
    if (!contentEl) throw new Error("no .cm-content found")
    stubLayout(contentEl, {scrollHeight: 300})

    deliverResize(wrapper.element)
    await settle()
    expect(wrapper.classes()).not.toContain("is-minimized")

    deliverResize(contentEl)
    await settle()
    expect(wrapper.classes()).toContain("is-minimized")
  })

  it("observes MarkdownContent's .cm-content only when the content can be minimized", async () => {
    const {default: MarkdownContent} = await import("../../../src/renderer/src/ui/common/misc/MarkdownContent.vue")
    const observe = vi.spyOn(window.ResizeObserver.prototype, "observe")

    const fixed = mount(MarkdownContent, {props: {content: "text", minimizable: false}, attachTo: document.body})
    wrapper = mount(MarkdownContent, {props: {content: "text"}, attachTo: document.body})
    await settle()

    const observed = observe.mock.calls.map(([element]) => element)
    expect(observed.filter((element) => fixed.element.contains(element))).toEqual([])
    expect(observed).toContain(wrapper.element.querySelector(".cm-content"))

    fixed.unmount()
  })

  it("fits DynamicTagsPanel's tags from a delivery on its probe, not one on its own container", async () => {
    const {default: DynamicTagsPanel} = await import("../../../src/renderer/src/ui/common/misc/DynamicTagsPanel.vue")

    const tags = [makeTag({id: "tag-1", name: "one"}), makeTag({id: "tag-2", name: "two"})]

    wrapper = mount(DynamicTagsPanel, {props: {tags}, global: {directives: {tooltip: {}}}, attachTo: document.body})
    await nextTick()

    const containerEl = wrapper.element
    const measureEl = containerEl.querySelector(".pointer-events-none")
    const probeEl = containerEl.lastElementChild
    const rowEl = Array.from(containerEl.children).find((el) => el !== measureEl && el !== probeEl)
    if (!measureEl || !probeEl || !rowEl || probeEl === measureEl) throw new Error("expected a measure row, a row and a probe")

    Array.from(measureEl.children).forEach((child) => stubLayout(child, {offsetWidth: 50}))
    stubLayout(containerEl, {offsetWidth: 200})

    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, ...rest) => {
      if (element === rowEl) {
        return {paddingLeft: "0px", paddingRight: "0px", borderLeftWidth: "0px", borderRightWidth: "0px", columnGap: "8px"}
      }
      return realGetComputedStyle(element, ...rest)
    })

    function visibleTagButtons() {
      return Array.from(rowEl.querySelectorAll("button.base-tag"))
    }

    deliverResize(containerEl)
    await settle()
    expect(visibleTagButtons()).toHaveLength(0)

    deliverResize(probeEl)
    await settle()
    expect(visibleTagButtons()).toHaveLength(2)
  })
})
