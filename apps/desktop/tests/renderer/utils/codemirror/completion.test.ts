import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {acceptCompletion, closeCompletion, completionStatus, currentCompletions, startCompletion} from "@codemirror/autocomplete"
import {createCompletionExtension, createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {EditorView} from "@codemirror/view"
import type {NestedCommand} from "../../../../src/renderer/src/utils/codemirror/extensions"

type Options = NonNullable<Parameters<typeof createCompletionExtension>[0]>

function makeCommand(label: string, names: string[], overrides: Partial<NestedCommand> = {}): NestedCommand {
  return {
    label,
    icon: "tags",
    getItems: (query) => names.filter((n) => n.toLowerCase().includes(query.toLowerCase())).map((n) => ({label: n, icon: "tags", apply: vi.fn()})),
    ...overrides,
  }
}

function mount(doc: string, cursor: number, options?: Options) {
  return mountEditorView(doc, {
    selection: {anchor: cursor},
    extensions: [createMarkdownLanguageExtension(), createCompletionExtension(options)],
  })
}

async function waitForActive(view: EditorView) {
  await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))
}

async function expectMenuStaysClosed(view: EditorView) {
  await vi.advanceTimersByTimeAsync(200)
  expect(completionStatus(view.state)).toBeNull()
}

describe("completion", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("opens the slash menu on '/' at a line start or after whitespace, never mid-word", async () => {
    const atLineStart = mount("/", 1)
    startCompletion(atLineStart)
    await waitForActive(atLineStart)
    expect(currentCompletions(atLineStart.state).map((o) => o.label)).toContain("/Divider")
    unmountEditorView(atLineStart)

    const afterWhitespace = mount("text /", 6)
    startCompletion(afterWhitespace)
    await waitForActive(afterWhitespace)
    await vi.advanceTimersByTimeAsync(75)
    acceptCompletion(afterWhitespace)
    expect(afterWhitespace.state.doc.toString()).toBe("text \n\n---\n\n")
    unmountEditorView(afterWhitespace)

    const midWord = mount("path/", 5)
    startCompletion(midWord)
    await expectMenuStaysClosed(midWord)
    unmountEditorView(midWord)
  })

  it("does not open the slash menu inside a fenced code block", async () => {
    const mounted = mount("```js\n/\n```\n", 7)
    startCompletion(mounted)
    await expectMenuStaysClosed(mounted)
    unmountEditorView(mounted)
  })

  it("lists slash commands in their declared order under '/'-prefixed labels", async () => {
    const mounted = mount("/", 1)
    startCompletion(mounted)
    await waitForActive(mounted)

    const options = currentCompletions(mounted.state)
    expect(options.every((o) => o.label.startsWith("/"))).toBe(true)
    expect(options.map((o) => o.label)).toEqual(expect.arrayContaining(["/Heading 1", "/Code Block"]))

    const byOrder = [...options].sort((a, b) => (a.sortText ?? "").localeCompare(b.sortText ?? ""))
    const labels = byOrder.map((o) => o.label.replace(/^\//, ""))
    expect(labels[0]).toBe("Divider")
    expect(labels.slice(1, 7)).toEqual(["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5", "Heading 6"])
    const bulletIndex = labels.indexOf("Bullet List")
    expect(labels[bulletIndex + 1]).toBe("Numbered List")

    unmountEditorView(mounted)
  })

  it("puts the task commands right after Divider and hides the unavailable ones", async () => {
    let hasTags = false
    const commands = [makeCommand("Status", []), makeCommand("Add Tag", []), makeCommand("Remove Tag", [], {isAvailable: () => hasTags})]

    const bare = mount("/", 1)
    startCompletion(bare)
    await waitForActive(bare)
    expect(currentCompletions(bare.state).map((o) => o.label)).not.toContain("/Add Tag")
    unmountEditorView(bare)

    const mounted = mount("/", 1, {commands})
    startCompletion(mounted)
    await waitForActive(mounted)
    const sorted = (view: EditorView) =>
      [...currentCompletions(view.state)].sort((a, b) => (a.sortText ?? "").localeCompare(b.sortText ?? "")).map((o) => o.label)
    expect(sorted(mounted).slice(0, 4)).toEqual(["/Divider", "/Status", "/Add Tag", "/Heading 1"])

    hasTags = true
    closeCompletion(mounted)
    startCompletion(mounted)
    await waitForActive(mounted)
    expect(sorted(mounted).slice(0, 4)).toEqual(["/Divider", "/Status", "/Add Tag", "/Remove Tag"])

    unmountEditorView(mounted)
  })

  it("filters the second-level list by what follows the command, spaces and Cyrillic included", async () => {
    const doc = "/Project Мой де"
    const mounted = mount(doc, doc.length, {commands: [makeCommand("Project", ["Мой дейли", "Мой дом", "Work"])]})
    startCompletion(mounted)
    await waitForActive(mounted)

    expect(currentCompletions(mounted.state).map((o) => o.label)).toEqual(["Мой дейли"])

    unmountEditorView(mounted)
  })

  it("applying a second-level item removes the command text and runs the item", async () => {
    const doc = "text /Status do"
    const apply = vi.fn()
    const command = makeCommand("Status", [], {getItems: () => [{label: "Done", icon: "check-check", apply}]})
    const mounted = mount(doc, doc.length, {commands: [command]})
    startCompletion(mounted)
    await waitForActive(mounted)
    await vi.advanceTimersByTimeAsync(75)

    acceptCompletion(mounted)

    expect(mounted.state.doc.toString()).toBe("text ")
    expect(apply).toHaveBeenCalledOnce()

    unmountEditorView(mounted)
  })
})
