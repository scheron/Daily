// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {installFakeResizeObserver} from "../../../helpers/resizeObserver"

const {deliverResizeToObserved} = installFakeResizeObserver()

function makeComment(content) {
  return {
    id: "comment-1",
    taskId: "task-1",
    branchId: "main",
    content,
    kind: "manual",
    provider: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  }
}

function rect(top, height = 20, width = 320) {
  return new DOMRect(0, top, width, height)
}

async function settle() {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await nextTick()
}

describe("Comment preview geometry proxy", () => {
  let wrapper = null
  let textRects
  let fonts
  let elementRect
  let originalFonts
  let bridge

  beforeEach(() => {
    setActivePinia(createPinia())
    bridge = mockBridgeIPC({"shell:open-external": vi.fn().mockResolvedValue(true)})
    originalFonts = Object.getOwnPropertyDescriptor(document, "fonts")
    fonts = new EventTarget()
    fonts.ready = Promise.resolve()
    Object.defineProperty(document, "fonts", {value: fonts, configurable: true})
    textRects = (text) => [rect(100 + (Number(text.match(/line (\d)/)?.[1] ?? 1) - 1) * 20)]
    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function () {
      return textRects(this.startContainer.textContent)
    })
    elementRect = () => rect(100, 140)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
      return elementRect(this)
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (originalFonts) Object.defineProperty(document, "fonts", originalFonts)
    else delete document.fonts
  })

  async function setup(content) {
    const {default: CommentItem} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Comments/{fragments}/CommentItem")
    wrapper = mount(CommentItem, {props: {comment: makeComment(content)}, attachTo: document.body, global: {directives: {tooltip: {}}}})
    await settle()
  }

  it("clips at the sixth measured line only when a seventh continues, using a geometry proxy", async () => {
    await setup("line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7")

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
    expect(wrapper.find(".comment-markdown").element.style.getPropertyValue("--comment-fade-height")).toBe("20px")
    expect(wrapper.text()).toContain("line 7")

    await wrapper.setProps({comment: makeComment("line 1\nline 2\nline 3\nline 4\nline 5\nline 6")})
    await settle()

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("")
    expect(wrapper.find(".comment-markdown").element.style.getPropertyValue("--comment-fade-height")).toBe("")
  })
  it("excludes links below the cutoff from sequential focus while keeping visible links accessible, using a geometry proxy", async () => {
    elementRect = (element) => {
      const line = Number(element.textContent.match(/^line (\d)/)?.[1] ?? 1)
      return element.matches(".cm-line, a.cm-link-widget") ? rect(100 + (line - 1) * 20) : rect(100, 160)
    }
    await setup(
      "[line 1 visible link](https://example.com/visible)\nline 2\nline 3\nline 4\nline 5\nline 6\n[line 7 hidden link](https://example.com/hidden)\nline 8",
    )

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
    const visibleLink = wrapper.find('a[href="https://example.com/visible"]').element
    visibleLink.focus()
    expect(document.activeElement).toBe(visibleLink)
    visibleLink.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    expect(bridge["shell:open-external"]).toHaveBeenCalledWith("https://example.com/visible")

    const sequentialLinks = wrapper
      .findAll("a.cm-link-widget")
      .map((link) => link.element)
      .filter((link) => link.tabIndex >= 0 && !link.closest("[inert]"))
    expect(sequentialLinks.map((link) => link.textContent)).toEqual(["line 1 visible link"])
  })

  it("remeasures after font metrics settle, using a geometry proxy", async () => {
    textRects = () => Array.from({length: 6}, (_, index) => rect(100 + index * 20))
    await setup("wrapped paragraph")
    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("")

    textRects = () => Array.from({length: 7}, (_, index) => rect(100 + index * 20))
    fonts.dispatchEvent(new Event("loadingdone"))
    await settle()

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
  })

  it("restores visible links after resize without changing their tabindex or existing inert state, using a geometry proxy", async () => {
    let expanded = false
    elementRect = (element) =>
      element.matches("a.cm-link-widget") ? rect(!expanded && element.textContent.includes("line 7") ? 220 : 100) : rect(100, 160)
    await setup("[line 1](https://example.com/one)\nline 2\nline 3\nline 4\nline 5\nline 6\n[line 7](https://example.com/seven)\nline 8")
    const [first, last] = wrapper.findAll("a.cm-link-widget").map((link) => link.element)
    first.setAttribute("inert", "")
    last.setAttribute("tabindex", "3")
    expect(last.closest("[inert]")).not.toBeNull()

    expanded = true
    textRects = (text) => [rect(text === "line 7" ? 100 : 100 + (Number(text.match(/line (\d)/)?.[1] ?? 1) - 1) * 20)]
    deliverResizeToObserved()
    await settle()

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
    expect(last.closest("[inert]")).toBeNull()
    expect(last.tabIndex).toBe(3)
    expect(first.hasAttribute("inert")).toBe(true)
    last.focus()
    expect(document.activeElement).toBe(last)
  })

  it("returns focus to the row when a focused link becomes clipped and restores replacement content, using a geometry proxy", async () => {
    textRects = () => [rect(100)]
    elementRect = (element) => (element.matches("a.cm-link-widget") ? rect(220) : rect(100, 160))
    await setup("line 1\nline 2\nline 3\nline 4\nline 5\nline 6\n[line 7](https://example.com/seven)")
    const link = wrapper.find("a.cm-link-widget").element
    link.focus()
    expect(document.activeElement).toBe(link)

    textRects = (text) => [rect(100 + (Number(text.match(/line (\d)/)?.[1] ?? 1) - 1) * 20)]
    deliverResizeToObserved()
    await settle()

    expect(document.activeElement).toBe(wrapper.find(".comment-row").element)
    expect(link.closest("[inert]")).not.toBeNull()
    expect(wrapper.find("button[aria-label='Open comment']").element.closest("[inert]")).toBeNull()

    await wrapper.setProps({comment: makeComment("[line 1 replacement](https://example.com/replacement)")})
    await settle()
    const replacement = wrapper.find("a.cm-link-widget").element
    expect(replacement.closest("[inert]")).toBeNull()
    replacement.focus()
    expect(document.activeElement).toBe(replacement)
  })

  it("excludes a late image retry button while clipped and restores it after layout changes, using a geometry proxy", async () => {
    let expanded = false
    elementRect = (element) => (element.matches(".cm-image-wrapper, button") ? rect(expanded ? 100 : 220) : rect(100, 160))
    await setup("line 1\nline 2\nline 3\nline 4\nline 5\nline 6\n![attachment](daily://file/example)")
    vi.useFakeTimers()
    const image = wrapper.find("img").element
    for (let retry = 0; retry < 3; retry++) {
      image.dispatchEvent(new Event("error"))
      await vi.advanceTimersByTimeAsync(2000)
    }
    image.dispatchEvent(new Event("error"))
    await vi.advanceTimersByTimeAsync(100)
    vi.useRealTimers()
    await settle()
    await settle()
    const retry = wrapper.findAll("button").find((button) => button.text() === "Retry")
    expect(retry.element.closest("[inert]")).not.toBeNull()

    expanded = true
    textRects = () => [rect(100)]
    deliverResizeToObserved()
    await settle()
    expect(retry.element.closest("[inert]")).toBeNull()
    retry.element.focus()
    expect(document.activeElement).toBe(retry.element)
    await retry.trigger("click")
    expect(wrapper.find("img").element).toBe(image)
    expect(wrapper.text()).not.toContain("Failed to load image")
  })
  it.each([
    ["blank paragraphs", "line 1\nline 2\n\nline 4\nline 5\nline 6\nline 7", ".cm-line", 2],
    ["empty code lines", "```plaintext\nline 1\nline 2\n\nline 4\nline 5\nline 6\nline 7\n```", ".cm-codeblock-text-line", 2],
    ["an image row", "![attachment](daily://file/example)\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7", ".cm-image-wrapper", 0],
    ["table rows", "| a | b |\n| - | - |\n| c | d |\nline 3\nline 4\nline 5\nline 6\nline 7", ".cm-table tr", 0],
  ])("counts %s in the six rendered lines, using a geometry proxy", async (_name, content, selector, index) => {
    elementRect = (element) => {
      if (element.matches(selector)) {
        const siblings = Array.from(element.closest(".cm-content").querySelectorAll(selector))
        return rect(100 + siblings.indexOf(element) * 20)
      }
      return rect(100, 140)
    }
    if (index === 2) {
      elementRect = (element) => (element.matches(selector) && !element.textContent ? rect(140) : rect(100, 140))
    }
    await setup(content)

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
    expect(wrapper.find(".comment-markdown").element.style.getPropertyValue("--comment-fade-height")).toBe("20px")
  })

  it("counts wrapped rows once despite inline formatting and retains an unclipped six-line preview, using a geometry proxy", async () => {
    await setup("# line 1 **bold**\n- line 2\nline 3\nline 4\nline 5\nline 6")
    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("")

    textRects = () => Array.from({length: 7}, (_, index) => rect(100 + index * 20))
    await wrapper.setProps({comment: makeComment("one paragraph that wraps")})
    await settle()

    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
  })

  it("clears stale clipping after resize and measures again when a hidden panel returns, using a geometry proxy", async () => {
    textRects = () => Array.from({length: 7}, (_, index) => rect(100 + index * 20))
    await setup("wrapped paragraph")
    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")

    textRects = () => [rect(100)]
    deliverResizeToObserved()
    await settle()
    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("")

    elementRect = () => rect(100, 0, 0)
    textRects = () => []
    deliverResizeToObserved()
    await settle()
    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("")

    elementRect = () => rect(100, 140)
    textRects = () => Array.from({length: 7}, (_, index) => rect(100 + index * 20))
    deliverResizeToObserved()
    await settle()
    expect(wrapper.find(".comment-markdown").element.style.maxHeight).toBe("120px")
  })

  it("measures replacement Markdown and image load completion and stops after unmount, using a geometry proxy", async () => {
    elementRect = (element) => (element.matches(".cm-image-wrapper") ? rect(240) : rect(100, 140))
    await setup("line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\n![attachment](daily://file/example)")
    const viewport = wrapper.find(".comment-markdown").element
    expect(viewport.style.maxHeight).toBe("120px")

    textRects = () => [rect(100)]
    const content = wrapper.find(".cm-content").element
    content.replaceWith(content.cloneNode(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await settle()
    expect(viewport.style.maxHeight).toBe("")

    textRects = () => Array.from({length: 7}, (_, index) => rect(100 + index * 20))
    wrapper.find("img").element.dispatchEvent(new Event("load"))
    await settle()
    expect(viewport.style.maxHeight).toBe("120px")

    textRects = () => [rect(100)]
    const measurements = Range.prototype.getClientRects.mock.calls.length
    const disconnectResize = vi.spyOn(ResizeObserver.prototype, "disconnect")
    const disconnectMutation = vi.spyOn(MutationObserver.prototype, "disconnect")
    deliverResizeToObserved()
    wrapper.unmount()
    wrapper = null
    fonts.dispatchEvent(new Event("loadingdone"))
    await settle()
    expect(Range.prototype.getClientRects.mock.calls.length).toBe(measurements)
    expect(disconnectResize).toHaveBeenCalled()
    expect(disconnectMutation).toHaveBeenCalled()
  })

  it("keeps links external and images zoomable inside the preview", async () => {
    await setup("[docs](https://example.com)\n![attachment](daily://file/example)")
    const linkEvent = new MouseEvent("click", {bubbles: true, cancelable: true})
    wrapper.find("a.cm-link-widget").element.dispatchEvent(linkEvent)
    expect(bridge["shell:open-external"]).toHaveBeenCalledWith("https://example.com")
    expect(linkEvent.defaultPrevented).toBe(true)

    wrapper.find("img").element.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    const {useBaseModal} = await import("../../../../src/renderer/src/ui/base/BaseModal")
    const modal = useBaseModal("image-preview")
    expect(modal.stack.value.find((item) => item.id === "image-preview")?.props.src).toBe("daily://file/example")
    expect(wrapper.emitted("open")).toBeUndefined()
    modal.remove("image-preview")
  })

  it("retains the image error state and manual retry without opening a comment", async () => {
    await setup("![attachment](daily://file/example)")
    vi.useFakeTimers()
    const image = wrapper.find("img").element
    for (let retry = 0; retry < 3; retry++) {
      image.dispatchEvent(new Event("error"))
      await vi.advanceTimersByTimeAsync(2000)
    }
    image.dispatchEvent(new Event("error"))
    await vi.advanceTimersByTimeAsync(20)
    expect(wrapper.text()).toContain("Failed to load image: attachment")

    const retry = wrapper.findAll("button").find((button) => button.text() === "Retry")
    await retry.trigger("click")
    expect(wrapper.find("img").element).toBe(image)
    expect(image.src).toMatch(/^daily:\/\/file\/example\?retry=\d+$/)
    expect(wrapper.text()).not.toContain("Failed to load image")
    expect(wrapper.emitted("open")).toBeUndefined()
  })
})
