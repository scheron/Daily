// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {acceptCompletion, selectedCompletionIndex} from "@codemirror/autocomplete"
import {EditorView} from "@codemirror/view"
import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {pressKey, typeText} from "../../../helpers/editorView"

const uploadImageFile = vi.hoisted(() => vi.fn())
vi.mock("../../../../src/renderer/src/ui/common/misc/MarkdownEditor/utils/uploadImageFile", () => ({uploadImageFile}))

describe("MarkdownEditor", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    uploadImageFile.mockReset().mockResolvedValue("![shot](file://shot.png)")
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  async function mountEditor(content) {
    const {default: MarkdownEditor} = await import("../../../../src/renderer/src/ui/common/misc/MarkdownEditor")
    wrapper = mount(MarkdownEditor, {props: {content}, attachTo: document.body, global: {directives: {tooltip: {}}}})
    return EditorView.findFromDOM(wrapper.element)
  }

  it("Ctrl+N moves the selection of an open completion list", async () => {
    vi.useFakeTimers()
    const view = await mountEditor("")
    typeText(view, "/")
    await vi.waitFor(() => expect(selectedCompletionIndex(view.state)).toBe(0))
    await vi.advanceTimersByTimeAsync(75)

    pressKey(view, {key: "n", ctrlKey: true})

    expect(selectedCompletionIndex(view.state)).toBe(1)
  })

  it("deleting a middle item renumbers the list", async () => {
    const view = await mountEditor("1. a\n2. b\n3. c\n4. d")
    view.dispatch({selection: {anchor: 5, head: 10}})

    pressKey(view, {key: "Backspace"})

    expect(view.state.doc.toString()).toBe("1. a\n2. c\n3. d")
  })

  it("content replaced from outside keeps its numbering", async () => {
    const view = await mountEditor("")

    await wrapper.setProps({content: "3. a\n4. b"})

    expect(view.state.doc.toString()).toBe("3. a\n4. b")
  })

  it("typing an opening bracket closes the pair around the caret", async () => {
    const view = await mountEditor("")

    typeText(view, "(")

    expect(view.state.doc.toString()).toBe("()")
    expect(view.state.selection.main.head).toBe(1)
  })

  it("Backspace between a bracket pair removes both halves", async () => {
    const view = await mountEditor("()")
    view.dispatch({selection: {anchor: 1}})

    pressKey(view, {key: "Backspace"})

    expect(view.state.doc.toString()).toBe("")
  })

  it("typing ```ts then Enter inside a list item closes the fence", async () => {
    const view = await mountEditor("- item\n  ")
    view.dispatch({selection: {anchor: view.state.doc.length}})

    typeText(view, "```ts")
    pressKey(view, {key: "Enter"})

    expect(view.state.doc.toJSON()).toEqual(["- item", "  ```ts", expect.any(String), "  ```"])
  })

  describe("with a task", () => {
    const task = {
      id: "__draft__",
      branchId: "main",
      scheduled: null,
      estimatedTime: 0,
      spentTime: 0,
      content: "",
      status: "backlog",
      tags: [],
      milestoneId: null,
    }

    async function mountTaskEditor(content) {
      const {default: MarkdownEditor} = await import("../../../../src/renderer/src/ui/common/misc/MarkdownEditor")
      wrapper = mount(MarkdownEditor, {props: {content, task}, attachTo: document.body, global: {directives: {tooltip: {}}}})
      return EditorView.findFromDOM(wrapper.element)
    }

    async function choose(view) {
      await vi.advanceTimersByTimeAsync(200)
      await vi.waitFor(() => expect(selectedCompletionIndex(view.state)).toBe(0))
      acceptCompletion(view)
    }

    it("emits the draft patch for a status, a typed date and a typed estimate", async () => {
      vi.useFakeTimers()
      const view = await mountTaskEditor("")

      typeText(view, "/Status act")
      await choose(view)
      typeText(view, "/Date 05.10")
      await choose(view)
      typeText(view, "/Estimate 1h30m")
      await choose(view)

      const patches = wrapper.emitted("patch").map(([updates]) => updates)
      expect(patches[0]).toEqual({status: "active"})
      expect(patches[1].scheduled.date).toMatch(/^\d{4}-10-05$/)
      expect(patches[2]).toEqual({estimatedTime: 5400})
    })

    function dropImage(target) {
      const file = new File(["x"], "shot.png", {type: "image/png"})
      const event = new Event("drop", {bubbles: true, cancelable: true})
      event.dataTransfer = {files: [file], types: ["Files"]}
      target.dispatchEvent(event)
      return event
    }

    function pasteImage(target) {
      const file = new File(["x"], "shot.png", {type: "image/png"})
      const event = new Event("paste", {bubbles: true, cancelable: true})
      event.clipboardData = {items: [{type: "image/png", getAsFile: () => file}], getData: () => ""}
      target.dispatchEvent(event)
    }

    it("inserts a dropped or pasted image by default", async () => {
      const view = await mountTaskEditor("")

      dropImage(wrapper.element)
      await vi.waitFor(() => expect(view.state.doc.toString()).toBe("![shot](file://shot.png)"))
      pasteImage(view.contentDOM)
      await vi.waitFor(() => expect(uploadImageFile).toHaveBeenCalledTimes(2))
    })

    it("ignores a dropped or pasted image when attachments are off", async () => {
      const {default: MarkdownEditor} = await import("../../../../src/renderer/src/ui/common/misc/MarkdownEditor")
      wrapper = mount(MarkdownEditor, {props: {content: "", task, noAttachments: true}, attachTo: document.body, global: {directives: {tooltip: {}}}})
      const view = EditorView.findFromDOM(wrapper.element)
      await nextTick()

      const drop = dropImage(wrapper.element)
      pasteImage(view.contentDOM)
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(drop.defaultPrevented).toBe(true)
      expect(uploadImageFile).not.toHaveBeenCalled()
      expect(view.state.doc.toString()).toBe("")
    })
  })
})
