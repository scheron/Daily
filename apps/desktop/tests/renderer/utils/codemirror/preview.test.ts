import {describe, expect, it} from "vitest"

import {EditorState} from "@codemirror/state"
import {Decoration, EditorView} from "@codemirror/view"
import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createReadonlyThemeExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {renderMarkdownPreview} from "../../../../src/renderer/src/utils/codemirror/preview"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {EditorView as EditorViewInstance} from "@codemirror/view"
import type {SearchMatch} from "@daily/protocol"

const EVERYTHING_DOCUMENT = [
  "# Heading one",
  "## Heading two",
  "### Heading three",
  "",
  "Plain text with **bold**, *italic*, ~~struck~~ and `inline code`.",
  "A [link to Daily](https://example.com) and <b>raw html stays text</b>.",
  "",
  "- first bullet",
  "  - nested bullet",
  "- second bullet",
  "",
  "1. first step",
  "2. second step",
  "",
  "- [ ] open task",
  "- [x] done task",
  "",
  "> A quoted line",
  "",
  "---",
  "",
  "| Left | Center | Right |",
  "|:-----|:------:|------:|",
  "| a    | **b**  | `c`   |",
  "",
  "![diagram =120x60](daily://file/abc)",
  "",
  "```js",
  "const answer = 42",
  "```",
  "",
  "```python",
  "def greet(name):",
  '    return f"hi {name}"',
  "```",
  "",
].join("\n")

function regularExtensions() {
  return [
    createMarkdownLanguageExtension(),
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    EditorView.contentAttributes.of({contenteditable: "false", tabindex: "-1"}),
    createThemeExtension(),
    createWYSIWYGExtension({isReadonly: true}),
    createTablesExtension(),
    createCodeSyntaxExtension(),
    createReadonlyThemeExtension({isCompact: false}),
  ]
}

function compactExtensionsWithHighlight(matches: SearchMatch[]) {
  return [
    createMarkdownLanguageExtension(),
    EditorView.lineWrapping,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    createThemeExtension(),
    createWYSIWYGExtension({isReadonly: true}),
    createTablesExtension(),
    createCodeSyntaxExtension(),
    EditorView.decorations.of(
      Decoration.set(
        matches.flatMap((match) => match.indices.map(([start, end]) => Decoration.mark({class: "cm-search-highlight"}).range(start, end + 1))),
        true,
      ),
    ),
    createReadonlyThemeExtension({isCompact: true}),
  ]
}

function classTokens(el: Element): string[] {
  return Array.from(el.classList).sort()
}

function findScroller(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>(".cm-scroller")
  if (!el) throw new Error("no .cm-scroller found")
  return el
}

function findContent(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>(".cm-content")
  if (!el) throw new Error("no .cm-content found")
  return el
}

type CharSpanModel = string[][]

function charSpans(line: HTMLElement): CharSpanModel {
  const spans: string[][] = []

  function walk(node: ChildNode, active: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      for (let i = 0; i < text.length; i++) spans.push([...active].sort())
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.tagName === "BR") return
    const next = active.concat(Array.from(element.classList))
    element.childNodes.forEach((child) => walk(child, next))
  }

  line.childNodes.forEach((child) => walk(child, []))
  return spans
}

type LineModel =
  | {kind: "line"; text: string; classes: string[]; dataLanguage: string | null; chars: CharSpanModel}
  | {kind: "widget"; tag: string; classes: string[]}

function lineModel(content: HTMLElement): LineModel[] {
  return Array.from(content.children).map((child) => {
    const element = child as HTMLElement
    if (element.classList.contains("cm-line")) {
      return {
        kind: "line" as const,
        text: element.textContent ?? "",
        classes: classTokens(element),
        dataLanguage: element.getAttribute("data-language"),
        chars: charSpans(element),
      }
    }
    return {kind: "widget" as const, tag: element.tagName, classes: classTokens(element)}
  })
}

function checkboxStates(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLInputElement>("input.cm-task-checkbox")).map((el) => el.checked)
}

function linkSummaries(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>("a.cm-link-widget")).map((el) => [el.textContent, el.getAttribute("href")])
}

function imageSummaries(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLImageElement>(".cm-image-wrapper img")).map((el) => [
    el.getAttribute("src"),
    el.getAttribute("alt"),
    el.style.width,
    el.style.height,
  ])
}

function tableSummaries(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(".cm-table-wrapper")).map((wrapper) => ({
    header: Array.from(wrapper.querySelectorAll("thead th")).map((el) => el.textContent),
    rows: Array.from(wrapper.querySelectorAll("tbody tr")).map((row) => Array.from(row.children).map((cell) => cell.textContent)),
  }))
}

function copyButtonCount(root: HTMLElement) {
  return root.querySelectorAll("button.cm-code-copy").length
}

function expectParity(previewRoot: HTMLElement, view: EditorViewInstance) {
  expect(classTokens(previewRoot)).toEqual(classTokens(view.dom))
  expect(classTokens(findScroller(previewRoot))).toEqual(classTokens(view.scrollDOM))
  expect(classTokens(findContent(previewRoot))).toEqual(classTokens(view.contentDOM))

  expect(lineModel(findContent(previewRoot))).toEqual(lineModel(view.contentDOM))

  expect(checkboxStates(previewRoot)).toEqual(checkboxStates(view.dom))
  expect(linkSummaries(previewRoot)).toEqual(linkSummaries(view.dom))
  expect(imageSummaries(previewRoot)).toEqual(imageSummaries(view.dom))
  expect(tableSummaries(previewRoot)).toEqual(tableSummaries(view.dom))
  expect(copyButtonCount(previewRoot)).toEqual(copyButtonCount(view.dom))

  expect(EditorView.findFromDOM(previewRoot)).toBeNull()
}

describe("renderMarkdownPreview", () => {
  it("matches_TC-1_a_real_read-only_editor_for_the_everything-document", () => {
    const view = mountEditorView(EVERYTHING_DOCUMENT, {extensions: regularExtensions()})
    const preview = renderMarkdownPreview(EVERYTHING_DOCUMENT, {isCompact: false})

    expect(checkboxStates(view.dom)).toEqual([false, true])
    expect(copyButtonCount(view.dom)).toBeGreaterThan(0)
    expect(tableSummaries(view.dom).length).toBeGreaterThan(0)

    expectParity(preview.element, view)

    unmountEditorView(view)
  })

  it("matches_TC-2_a_real_read-only_editor_with_search_highlights_crossing_hidden_syntax", () => {
    const matches: SearchMatch[] = [
      {
        indices: [
          [59, 66],
          [102, 105],
        ],
        value: "with **bold ... inline code",
        key: "plainText",
      },
    ]

    const view = mountEditorView(EVERYTHING_DOCUMENT, {extensions: compactExtensionsWithHighlight(matches)})
    const preview = renderMarkdownPreview(EVERYTHING_DOCUMENT, {isCompact: true, matches})

    expect(view.dom.querySelectorAll(".cm-search-highlight").length).toBeGreaterThan(0)

    expectParity(preview.element, view)

    unmountEditorView(view)
  })

  it("keeps_TC-3_html_look-alikes_as_text_with_no_element_construction_or_script_execution", () => {
    const doc = 'Before <img src=x onerror="window.__pwned=1"> middle <script>window.__pwned=1</script> after <b>x</b> end'
    delete (globalThis as any).__pwned

    const preview = renderMarkdownPreview(doc, {isCompact: false})

    expect(preview.element.querySelector("img")).toBeNull()
    expect(preview.element.querySelector("script")).toBeNull()
    expect(preview.element.querySelector("b")).toBeNull()
    expect(preview.element.textContent).toContain('<img src=x onerror="window.__pwned=1">')
    expect(preview.element.textContent).toContain("<script>window.__pwned=1</script>")
    expect(preview.element.textContent).toContain("<b>x</b>")
    expect((globalThis as any).__pwned).toBeUndefined()
  })

  it("renders_TC-4_a_not-yet-loaded_language_plain_then_highlighted_once_it_settles", async () => {
    const doc = "```ruby\ndef greet\n  1\nend\n```"

    const first = renderMarkdownPreview(doc, {isCompact: false})
    const firstCodeLines = Array.from(first.element.querySelectorAll(".cm-codeblock-line:not(.cm-codeblock-first):not(.cm-codeblock-last)"))

    expect(first.element.textContent).toContain("def greet")
    expect(firstCodeLines.some((line) => line.querySelector("span[class]"))).toBe(false)
    expect(first.languagesLoaded).not.toBeNull()

    await first.languagesLoaded

    const second = renderMarkdownPreview(doc, {isCompact: false})
    const secondCodeLines = Array.from(second.element.querySelectorAll(".cm-codeblock-line:not(.cm-codeblock-first):not(.cm-codeblock-last)"))

    expect(secondCodeLines.some((line) => line.querySelector("span[class]"))).toBe(true)
  })
})
