// @vitest-environment happy-dom
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {makeTask} from "../../../helpers/taskFixtures"
import {findTipTapEditor, pressTipTapKey as pressKey, typeTipTapText as typeText} from "../../../helpers/tiptapEditor"

import type MarkdownEditorComponent from "@/ui/common/(editors)/MarkdownEditor"

type EditorProps = InstanceType<typeof MarkdownEditorComponent>["$props"]

const uploadImageFile = vi.hoisted(() => vi.fn())
vi.mock("../../../../src/renderer/src/ui/common/(editors)/MarkdownEditor/utils/uploadImageFile", () => ({uploadImageFile}))

const fileMarkdown = "![shot =240x120](daily://file/DF-shot)"
const task = makeTask({id: "__draft__", status: "backlog", content: "", scheduled: null})

function dispatchImageEvent(
  type: "drop" | "paste" | "dragover",
  target: Element,
  {files = [new File(["x"], "shot.png", {type: "image/png"})], trusted = false} = {},
) {
  const event = new Event(type, {bubbles: true, cancelable: true})
  const transfer = {files, types: ["Files"]}
  const clipboard = {
    ...transfer,
    items: files.map((file) => ({
      kind: "file",
      type: file.type,
      getAsFile() {
        return file
      },
    })),
    getData() {
      return ""
    },
  }
  Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {value: type === "paste" ? clipboard : transfer})
  if (trusted) Object.defineProperty(event, "isTrusted", {value: true})
  target.dispatchEvent(event)
  return event
}

describe("MarkdownEditor", () => {
  let unmount: (() => void) | null = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    uploadImageFile.mockReset().mockResolvedValue(fileMarkdown)
  })

  afterEach(() => {
    unmount?.()
    unmount = null
  })

  async function mountEditor(content: string, props: Partial<Omit<EditorProps, "content">> = {}) {
    const {default: MarkdownEditor} = await import("../../../../src/renderer/src/ui/common/(editors)/MarkdownEditor")
    const wrapper = mount(MarkdownEditor, {props: {content, ...props}, attachTo: document.body, global: {directives: {tooltip: {}}}})
    unmount = cleanup
    await vi.waitFor(() => expect(wrapper.find(".tiptap").exists()).toBe(true))
    const editor = findTipTapEditor(wrapper.element)!
    function lastMarkdown() {
      return wrapper.emitted<[string]>("update:content")?.at(-1)?.[0]
    }
    function cleanup() {
      wrapper.unmount()
    }
    return {wrapper, editor, lastMarkdown}
  }

  it("keeps original Markdown when opening, replacing and undoing an edit", async () => {
    const {wrapper, lastMarkdown} = await mountEditor("Title\n=====\n\n* item")
    expect(lastMarkdown()).toBeUndefined()
    const replacement = "New title\n=========\n\n3. item\n4. another"
    await wrapper.setProps({content: replacement})
    expect(lastMarkdown()).toBeUndefined()
    await vi.waitFor(() => expect(findTipTapEditor(wrapper.element)?.state.doc.textContent).toContain("New title"))
    const editor = findTipTapEditor(wrapper.element)!
    editor.commands.setTextSelection(4)
    typeText(editor, "!")
    expect(lastMarkdown()).toContain("!")
    expect(editor.commands.undo()).toBe(true)
    expect(lastMarkdown()).toBe(replacement)
  })

  it("navigates the internal completion menu and hides it when the query has no matches", async () => {
    const {editor} = await mountEditor("")
    typeText(editor, "a")
    expect(document.querySelector('[role="listbox"][aria-label="Slash commands"]')).toBeNull()
    editor.commands.deleteRange({from: 1, to: 2})
    expect(editor.state.doc.textContent).toBe("")
    typeText(editor, "/")
    await vi.waitFor(() => expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim()).toBe("Divider"))
    pressKey(editor, "n", {ctrlKey: true})
    await vi.waitFor(() => expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim()).toBe("Heading 1"))
    typeText(editor, "zzz")
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"][aria-label="Slash commands"]')).toBeNull())
    expect(editor.state.doc.textContent).toBe("/zzz")
  })

  it("applies a clicked completion without losing the editor keyboard focus", async () => {
    const {editor} = await mountEditor("")
    typeText(editor, "/")
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0))
    const heading = [...document.querySelectorAll('[role="option"]')].find((row) => row.textContent?.trim() === "Heading 2")!
    heading.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true}))
    heading.dispatchEvent(new MouseEvent("click", {bubbles: true}))

    expect(editor.state.doc.firstChild?.type.name).toBe("heading")
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2)
    expect(editor.state.doc.textContent).toBe("")
    await vi.waitFor(() => expect(editor.view.hasFocus()).toBe(true))
    expect(document.querySelector('[role="listbox"][aria-label="Slash commands"]')).toBeNull()
  })

  it("dismisses slash suggestions on Escape without deleting the typed text", async () => {
    const {editor} = await mountEditor("")
    typeText(editor, "/")
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0))

    pressKey(editor, "Escape")

    await vi.waitFor(() => expect(document.querySelector('[role="listbox"][aria-label="Slash commands"]')).toBeNull())
    expect(editor.state.doc.textContent).toBe("/")
  })

  it("keeps ordered list numbering after deleting a middle item", async () => {
    const {editor, lastMarkdown} = await mountEditor("1. a\n2. b\n3. c\n4. d")
    const list = editor.state.doc.firstChild!
    const item = list.child(1)
    const from = 1 + list.child(0).nodeSize
    editor.commands.deleteRange({from, to: from + item.nodeSize})
    expect(lastMarkdown()?.trim()).toBe("1. a\n2. c\n3. d")
  })

  it("inserts a closing bracket and removes the pair with one Backspace", async () => {
    const {editor} = await mountEditor("")
    typeText(editor, "(")
    expect(editor.state.doc.textContent).toBe("()")
    expect(editor.state.selection.from).toBe(2)
    pressKey(editor, "Backspace")
    expect(editor.state.doc.textContent).toBe("")
  })

  it("turns typed Markdown into an editable link and image", async () => {
    const {wrapper, editor, lastMarkdown} = await mountEditor("")
    typeText(editor, "[Guide](https://example.com/guide)")
    const link = wrapper.element.querySelector(".tiptap a")
    expect(link?.textContent).toBe("Guide")
    expect(link?.getAttribute("href")).toBe("https://example.com/guide")

    pressKey(editor, "Enter")
    typeText(editor, "![Screenshot](https://example.com/shot.png)")
    expect(wrapper.element.querySelector(".tiptap img[src]")?.getAttribute("src")).toBe("https://example.com/shot.png")
    expect(lastMarkdown()).toContain("![Screenshot](https://example.com/shot.png)")
  })

  it("opens a fenced code block inside a list from the keyboard", async () => {
    const {editor, lastMarkdown} = await mountEditor("- item")
    editor.commands.setTextSelection(7)
    pressKey(editor, "Enter", {shiftKey: true})
    typeText(editor, "```ts")
    pressKey(editor, "Enter")
    expect(editor.isActive("codeBlock")).toBe(true)
    expect(lastMarkdown()).toMatch(/```ts\n[\s\S]*```/)
  })

  it("emits status, date and estimate patches when choosing task commands", async () => {
    const {wrapper, editor} = await mountEditor("", {task})
    for (const query of ["/Status in prog", "/Date 05.10", "/Estimate 1h30m"]) {
      typeText(editor, query)
      await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBe(1))
      pressKey(editor, "Enter")
      await vi.waitFor(() => expect(document.querySelector('[role="listbox"][aria-label="Slash commands"]')).toBeNull())
    }
    const patches = wrapper.emitted("patch")?.map(([update]) => update)
    expect(patches).toEqual([
      {status: "in_progress"},
      {scheduled: expect.objectContaining({date: expect.stringMatching(/^\d{4}-10-05$/)})},
      {estimatedTime: 5400},
    ])
    expect(editor.state.doc.textContent).toBe("")
  })

  it("inserts dropped and pasted images as Daily Markdown", async () => {
    const {wrapper, editor, lastMarkdown} = await mountEditor("", {task})
    expect(dispatchImageEvent("drop", wrapper.element).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(uploadImageFile).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(lastMarkdown()?.trim()).toBe(fileMarkdown))
    dispatchImageEvent("paste", editor.view.dom)
    await vi.waitFor(() => expect(lastMarkdown()?.split(fileMarkdown)).toHaveLength(3))
    expect(uploadImageFile).toHaveBeenCalledTimes(2)
  })

  it("inserts the GIF when a clipboard image also has a static representation", async () => {
    const {editor, lastMarkdown} = await mountEditor("", {task})
    const gifMarkdown = "![animation =240x120](daily://file/DF-animation)"
    uploadImageFile.mockImplementation(async (file: File) => (file.type === "image/gif" ? gifMarkdown : fileMarkdown))

    dispatchImageEvent("paste", editor.view.dom, {
      files: [new File(["static"], "shot.png", {type: "image/png"}), new File(["animated"], "animation.gif", {type: "image/gif"})],
    })

    await vi.waitFor(() => expect(lastMarkdown()?.trim()).toBe(gifMarkdown))
  })

  it("inserts the original clipboard GIF when Chromium only exposes a PNG", async () => {
    mockBridgeIPC({"clipboard:read-gif": vi.fn().mockResolvedValue(Uint8Array.of(71, 73, 70, 56, 57, 97))})
    const {editor, lastMarkdown} = await mountEditor("", {task})
    const gifMarkdown = "![animation =240x120](daily://file/DF-animation)"
    uploadImageFile.mockImplementation(async (file: File) => (file.type === "image/gif" ? gifMarkdown : fileMarkdown))

    dispatchImageEvent("paste", editor.view.dom, {trusted: true})

    await vi.waitFor(() => expect(lastMarkdown()?.trim()).toBe(gifMarkdown))
  })

  it("inserts paste at the caret, including whitespace-only text", async () => {
    const {editor} = await mountEditor("A B", {task})
    editor.commands.setTextSelection(2)
    for (const value of ["x ", " "]) {
      const event = new Event("paste", {bubbles: true, cancelable: true})
      Object.defineProperty(event, "clipboardData", {value: {items: [], files: [], getData: () => value}})
      editor.view.dom.dispatchEvent(event)
    }

    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.textContent).toBe("Ax   B")
  })

  it("keeps the entire code block when a file is dropped inside it", async () => {
    const {wrapper, editor, lastMarkdown} = await mountEditor("```ts\nconst rest = 1\n```", {task})
    editor.commands.setTextSelection(3)
    dispatchImageEvent("drop", wrapper.element)

    await vi.waitFor(() => expect(lastMarkdown()?.trim()).toBe(`\`\`\`ts\nco${fileMarkdown}nst rest = 1\n\`\`\``))
    expect(editor.state.doc.childCount).toBe(1)
  })

  it("shows no file drop ring when the editor is read-only", async () => {
    const {wrapper} = await mountEditor("", {task, readonly: true})
    expect(dispatchImageEvent("dragover", wrapper.element).defaultPrevented).toBe(true)
    expect(wrapper.element.classList.contains("ring-2")).toBe(false)
  })
})
