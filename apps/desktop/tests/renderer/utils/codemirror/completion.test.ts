import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {acceptCompletion, closeCompletion, completionStatus, currentCompletions, startCompletion} from "@codemirror/autocomplete"
import {createCompletionExtension, createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {EditorView} from "@codemirror/view"
import type {Tag} from "@daily/protocol"

type TagsOptions = NonNullable<Parameters<typeof createCompletionExtension>[0]>

function makeTag(name: string): Tag {
  return {
    id: `tag:${name}`,
    branchId: "branch:test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    name,
    color: "#888888",
  }
}

function makeTagsOptions(overrides: Partial<TagsOptions>): TagsOptions {
  return {getTags: () => [], getAttachedTags: () => [], onAddTag: vi.fn(), onRemoveTag: vi.fn(), ...overrides}
}

function mount(doc: string, cursor: number, options?: TagsOptions) {
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

  it("offers Add Tag after Divider, and Remove Tag only while the task has tags", async () => {
    const bare = mount("/", 1)
    startCompletion(bare)
    await waitForActive(bare)
    const bareLabels = currentCompletions(bare.state).map((o) => o.label)
    expect(bareLabels).not.toContain("/Add Tag")
    expect(bareLabels).not.toContain("/Remove Tag")
    expect(bareLabels).toContain("/Bullet List")
    unmountEditorView(bare)

    const attachedTags: Tag[] = []
    const withOptions = mount("/", 1, makeTagsOptions({getAttachedTags: () => attachedTags}))
    startCompletion(withOptions)
    await waitForActive(withOptions)
    const beforeAttach = currentCompletions(withOptions.state).map((o) => o.label)
    expect(beforeAttach).toContain("/Add Tag")
    expect(beforeAttach).not.toContain("/Remove Tag")

    attachedTags.push(makeTag("Work"))
    closeCompletion(withOptions)
    startCompletion(withOptions)
    await waitForActive(withOptions)
    const afterAttach = currentCompletions(withOptions.state).map((o) => o.label)
    expect(afterAttach.slice(0, 3)).toEqual(["/Divider", "/Add Tag", "/Remove Tag"])

    unmountEditorView(withOptions)
  })

  it("offers every tag sorted by name after /Add Tag", async () => {
    const doc = "/Add Tag "
    const mounted = mount(doc, doc.length, makeTagsOptions({getTags: () => [makeTag("Work"), makeTag("Home")]}))
    startCompletion(mounted)
    await waitForActive(mounted)

    expect(currentCompletions(mounted.state).map((o) => o.label)).toEqual(["Home", "Work"])

    unmountEditorView(mounted)
  })

  it("offers only the attached tags after /Remove Tag", async () => {
    const doc = "/Remove Tag "
    const work = makeTag("Work")
    const mounted = mount(doc, doc.length, makeTagsOptions({getTags: () => [work, makeTag("Home")], getAttachedTags: () => [work]}))
    startCompletion(mounted)
    await waitForActive(mounted)

    expect(currentCompletions(mounted.state).map((o) => o.label)).toEqual(["Work"])

    unmountEditorView(mounted)
  })

  it("applying a tag removes the command text and adds the tag", async () => {
    const doc = "/Add Tag wo"
    const work = makeTag("Work")
    const onAddTag = vi.fn()
    const mounted = mount(doc, doc.length, makeTagsOptions({getTags: () => [work], onAddTag}))
    startCompletion(mounted)
    await waitForActive(mounted)
    await vi.advanceTimersByTimeAsync(75)

    acceptCompletion(mounted)

    expect(mounted.state.doc.toString()).toBe("")
    expect(onAddTag).toHaveBeenCalledWith(work)

    unmountEditorView(mounted)
  })
})
