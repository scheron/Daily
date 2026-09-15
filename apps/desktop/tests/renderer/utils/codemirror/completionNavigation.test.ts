import {afterEach, describe, expect, it, vi} from "vitest"

import {selectedCompletionIndex} from "@codemirror/autocomplete"
import {
  createCompletionExtension,
  createCompletionNavigationExtension,
  createMarkdownLanguageExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, pressKey, typeText, unmountEditorView} from "../../../helpers/editorView"

async function openSlashMenu() {
  vi.useFakeTimers()
  const view = mountEditorView("", {
    extensions: [createMarkdownLanguageExtension(), createCompletionExtension(), createCompletionNavigationExtension()],
  })
  typeText(view, "/")
  await vi.waitFor(() => expect(selectedCompletionIndex(view.state)).toBe(0))
  await vi.advanceTimersByTimeAsync(75)
  return view
}

describe("completion navigation", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("Ctrl+J and Ctrl+N move to the next option, Ctrl+K and Ctrl+P to the previous one", async () => {
    const view = await openSlashMenu()

    pressKey(view, {key: "n", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(1)

    pressKey(view, {key: "j", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(2)

    pressKey(view, {key: "J", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(3)

    pressKey(view, {key: "p", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(2)

    pressKey(view, {key: "k", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(1)

    pressKey(view, {key: "K", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(0)

    unmountEditorView(view)
  })

  it("a Ctrl chord with Meta, Alt or Shift, or a Ctrl+key it does not own, leaves the selection", async () => {
    const view = await openSlashMenu()

    pressKey(view, {key: "p"})
    expect(selectedCompletionIndex(view.state)).toBe(0)

    pressKey(view, {key: "p", ctrlKey: true, metaKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(0)

    pressKey(view, {key: "p", ctrlKey: true, altKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(0)

    pressKey(view, {key: "p", ctrlKey: true, shiftKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(0)

    pressKey(view, {key: "a", ctrlKey: true})
    expect(selectedCompletionIndex(view.state)).toBe(0)

    unmountEditorView(view)
  })
})
