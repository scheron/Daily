import {describe, expect, it} from "vitest"

import {
  createMarkdownLanguageExtension,
  createTablesExtension,
  createWYSIWYGExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

const TABLE = "before\n\n| H1 | H2 |\n| --- | :-: |\n| a | b |\n| c | d |\n\nafter"

function mount(doc: string, cursor: number, isReadonly = false) {
  return mountEditorView(doc, {
    selection: {anchor: cursor},
    extensions: [createMarkdownLanguageExtension(), createWYSIWYGExtension({isReadonly}), createTablesExtension()],
  })
}

function cellsHTML(tableMarkdown: string): string[] {
  const view = mount(`before\n\n${tableMarkdown}\n\nafter`, 0)
  const html = Array.from(view.dom.querySelectorAll("tbody td")).map((cell) => cell.innerHTML)
  unmountEditorView(view)
  return html
}

describe("tables live-preview", () => {
  it("renders a markdown table outside the cursor as an HTML table in a horizontal-scroll wrapper", () => {
    const view = mount(TABLE, 0)
    const wrapper = view.dom.querySelector(".cm-table-wrapper")
    const table = wrapper?.querySelector("table.cm-table")
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll("thead th").length).toBe(2)
    expect(table?.querySelectorAll("tbody tr").length).toBe(2)
    expect(table?.querySelector("thead th")?.textContent).toBe("H1")
    unmountEditorView(view)
  })

  it("shows raw markdown while the cursor is inside the table", () => {
    const view = mount(TABLE, 20)
    expect(view.dom.querySelector("table.cm-table")).toBeNull()
    unmountEditorView(view)
  })

  it("always renders the table in readonly mode", () => {
    const view = mount(TABLE, 20, true)
    expect(view.dom.querySelector("table.cm-table")).not.toBeNull()
    unmountEditorView(view)
  })

  it("renders bold, italic, code and strikethrough in a cell", () => {
    const html = cellsHTML("| H1 | H2 | H3 | H4 | H5 |\n| --- | --- | --- | --- | --- |\n| **b** | *i* | `c` | ~~s~~ | a **b** c |")
    expect(html).toEqual([
      '<strong class="cm-strong">b</strong>',
      '<em class="cm-emphasis">i</em>',
      '<span class="cm-code">c</span>',
      '<span style="text-decoration: line-through;">s</span>',
      'a <strong class="cm-strong">b</strong> c',
    ])
  })

  it("renders a link in a cell as its label, not a navigable link", () => {
    const html = cellsHTML("| H |\n| --- |\n| [label](http://x) |")
    expect(html).toEqual(['<span class="cm-link">label</span>'])
  })

  it("does not italicize underscores inside a word", () => {
    const html = cellsHTML("| H |\n| --- |\n| my_var_name |")
    expect(html).toEqual(["my_var_name"])
  })

  it("nests inline markup inside a cell", () => {
    const html = cellsHTML("| H |\n| --- |\n| **a `b`** |")
    expect(html).toEqual(['<strong class="cm-strong">a <span class="cm-code">b</span></strong>'])
  })
})
