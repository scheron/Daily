import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createWYSIWYGDecorations, readonlyMode} from "@/utils/codemirror/extensions/wysiwyg"

import {EditorState} from "@codemirror/state"

import type {DecorationSet} from "@codemirror/view"

type Entry = {from: number; to: number; class: string | null; widget: string | null}

function buildState(doc: string, cursor: number, readonly = false): EditorState {
  return EditorState.create({
    doc,
    selection: {anchor: cursor},
    extensions: [createMarkdownLanguageExtension(), readonlyMode.of(readonly)],
  })
}

function collect(decorations: DecorationSet): Entry[] {
  const out: Entry[] = []
  const iter = decorations.iter()

  while (iter.value) {
    const spec = iter.value.spec
    out.push({
      from: iter.from,
      to: iter.to,
      class: typeof spec.class === "string" ? spec.class : null,
      widget: spec.widget ? spec.widget.constructor.name : null,
    })
    iter.next()
  }

  return out
}

const hasHideLine = (entries: Entry[]) => entries.some((e) => e.class?.includes("cm-hide-line"))
const hiddenRange = (entries: Entry[], from: number, to: number) =>
  entries.some((e) => e.from === from && e.to === to && e.class === null && e.widget === null)

describe("createWYSIWYGDecorations", () => {
  it("does not hide the line while the cursor sits inside inline code", () => {
    const state = buildState("`hello`", 3)
    expect(hasHideLine(collect(createWYSIWYGDecorations(state, true)))).toBe(false)
  })

  it("hides inline-code backticks and styles the content on an inactive line", () => {
    // cursor on line 3, so line 1 (`code`) is inactive and should render
    const entries = collect(createWYSIWYGDecorations(buildState("`code`\n\nx", 8), true))
    expect(hiddenRange(entries, 0, 1)).toBe(true) // opening backtick
    expect(hiddenRange(entries, 5, 6)).toBe(true) // closing backtick
    expect(entries.some((e) => e.from === 1 && e.to === 5 && e.class === "cm-code")).toBe(true)
  })

  it("hides heading and bold markers on inactive lines", () => {
    const heading = collect(createWYSIWYGDecorations(buildState("# Title\n\nx", 9), true))
    expect(hiddenRange(heading, 0, 2)).toBe(true) // "# " marker + trailing space

    const bold = collect(createWYSIWYGDecorations(buildState("**b**\n\nx", 7), true))
    expect(hiddenRange(bold, 0, 2)).toBe(true) // opening **
    expect(hiddenRange(bold, 3, 5)).toBe(true) // closing **
  })

  it("renders links as a widget in readonly mode", () => {
    const entries = collect(createWYSIWYGDecorations(buildState("[text](http://x)", 0, true), false))
    expect(entries.some((e) => e.widget === "LinkWidget" && e.from === 0)).toBe(true)
  })

  it("leaves fenced code fence lines navigable (does not collapse them)", () => {
    // Collapsing fence lines to zero height traps the cursor and blocks exiting
    // the block — fences stay as real lines, like zennotes.
    const state = buildState("```js\nconst a = 1\n```\n", 22)
    expect(hasHideLine(collect(createWYSIWYGDecorations(state, true)))).toBe(false)
  })
})
