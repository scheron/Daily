// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {closeCompletion, completionStatus, moveCompletionSelection, startCompletion} from "@codemirror/autocomplete"
import {createCompletionExtension, createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {QuickCaptureMenu} from "../../../../src/shared/types/quickCapture"

describe("the slash menu reported to an external host", () => {
  let reported: Array<QuickCaptureMenu | null> = []

  beforeEach(() => {
    vi.useFakeTimers()
    reported = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mount(options?: Parameters<typeof createCompletionExtension>[0]) {
    return mountEditorView("/", {
      selection: {anchor: 1},
      extensions: [createMarkdownLanguageExtension(), createCompletionExtension(options, (menu) => reported.push(menu))],
    })
  }

  async function settle() {
    await vi.advanceTimersByTimeAsync(100)
  }

  it("reports the rows, the highlighted one and the caret, with the slash dropped from the labels", async () => {
    const view = mount()

    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))
    await settle()

    const menu = reported.at(-1)!
    expect(menu.rows[0]).toEqual(expect.objectContaining({label: "Divider", icon: "minus"}))
    expect(menu.rows.map((row) => row.label)).toContain("Code Block")
    expect(menu.selected).toBe(0)
    expect(menu.caretX).toEqual(expect.any(Number))

    unmountEditorView(view)
  })

  it("reports the moved selection and then a closed menu", async () => {
    const view = mount()
    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))

    await vi.advanceTimersByTimeAsync(100)
    moveCompletionSelection(true)(view)
    await settle()
    expect(reported.at(-1)!.selected).toBe(1)

    closeCompletion(view)
    await settle()
    expect(reported.at(-1)).toBeNull()

    unmountEditorView(view)
  })

  it("carries a tag option's colour and tone so the host can draw its chip", async () => {
    const view = mountEditorView("/Add Tag w", {
      selection: {anchor: 10},
      extensions: [
        createMarkdownLanguageExtension(),
        createCompletionExtension(
          {commands: [{label: "Add Tag", icon: "tags", tone: "remove", getItems: () => [{label: "work", color: "#ff0000", apply: vi.fn()}]}]},
          (menu) => reported.push(menu),
        ),
      ],
    })

    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))
    await settle()

    expect(reported.at(-1)!.rows).toEqual([expect.objectContaining({label: "work", color: "#ff0000", tone: "remove"})])

    unmountEditorView(view)
  })

  it("reports nothing while the menu has never been open", async () => {
    const view = mount()

    view.dispatch({changes: {from: 1, insert: "x"}})
    await settle()

    expect(reported).toEqual([])

    unmountEditorView(view)
  })
})
