import {describe, expect, it} from "vitest"

import {EditorState} from "@codemirror/state"
import {createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions/markdownLanguage"
import {createWYSIWYGDecorations, readonlyMode} from "../../../../src/renderer/src/utils/codemirror/extensions/wysiwyg"

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

  it("reveals the whole image source while the cursor is on its line", () => {
    const doc = "![image.png =500x209](daily://file/abc)"
    const entries = collect(createWYSIWYGDecorations(buildState(doc, doc.length), true))

    expect(entries.some((e) => e.widget === "ImageWidget")).toBe(false)
    expect(hiddenRange(entries, 0, 2)).toBe(false) // "!["
    expect(hiddenRange(entries, 20, 21)).toBe(false) // "]"
    expect(hiddenRange(entries, 21, 22)).toBe(false) // "("
    expect(hiddenRange(entries, 22, 38)).toBe(false) // the URL
  })

  it("reveals the whole link source while the cursor is on its line", () => {
    const doc = "[text](http://x)"
    const entries = collect(createWYSIWYGDecorations(buildState(doc, 2), true))

    expect(hiddenRange(entries, 0, 1)).toBe(false) // "["
    expect(hiddenRange(entries, 5, 6)).toBe(false) // "]"
    expect(hiddenRange(entries, 6, 7)).toBe(false) // "("
    expect(hiddenRange(entries, 7, 15)).toBe(false) // the URL
  })

  it("still hides image and link syntax on inactive lines", () => {
    const image = collect(createWYSIWYGDecorations(buildState("![a](u)\n\nx", 9), true))
    expect(image.some((e) => e.widget === "ImageWidget")).toBe(true)

    const link = collect(createWYSIWYGDecorations(buildState("[text](http://x)\n\nx", 18), true))
    expect(hiddenRange(link, 0, 1)).toBe(true) // "["
    expect(hiddenRange(link, 5, 6)).toBe(true) // "]"
    expect(hiddenRange(link, 6, 7)).toBe(true) // "("
    expect(hiddenRange(link, 7, 15)).toBe(true) // the URL
  })

  it("leaves fenced code fence lines navigable (does not collapse them)", () => {
    // Collapsing fence lines to zero height traps the cursor and blocks exiting
    // the block — fences stay as real lines, like zennotes.
    const state = buildState("```js\nconst a = 1\n```\n", 22)
    expect(hasHideLine(collect(createWYSIWYGDecorations(state, true)))).toBe(false)
  })
})
