import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension, createTablesExtension, createWYSIWYGExtension} from "@/utils/codemirror/extensions"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const TABLE = "before\n\n| H1 | H2 |\n| --- | :-: |\n| a | b |\n| c | d |\n\nafter"

function mount(doc: string, cursor: number, readonly = false) {
  const parent = document.createElement("div")
  document.body.appendChild(parent)
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: {anchor: cursor},
      extensions: [createMarkdownLanguageExtension(), createWYSIWYGExtension({readonly}), createTablesExtension()],
    }),
    parent,
  })
  return view
}

describe("tables live-preview", () => {
  it("renders a markdown table as an HTML table when the cursor is outside it", () => {
    const view = mount(TABLE, 0) // cursor on line 1 ("before")
    const table = view.dom.querySelector("table.cm-table")
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll("thead th").length).toBe(2)
    expect(table?.querySelectorAll("tbody tr").length).toBe(2)
    expect(table?.querySelector("thead th")?.textContent).toBe("H1")
    view.destroy()
  })

  it("shows raw markdown while the cursor is inside the table", () => {
    const view = mount(TABLE, 20) // inside the table block
    expect(view.dom.querySelector("table.cm-table")).toBeNull()
    view.destroy()
  })

  it("always renders the table in readonly mode", () => {
    const view = mount(TABLE, 20, true) // cursor 'inside' but readonly
    expect(view.dom.querySelector("table.cm-table")).not.toBeNull()
    view.destroy()
  })

  it("wraps the table in a horizontal-scroll container", () => {
    const view = mount(TABLE, 0) // cursor outside the table → it renders
    const wrapper = view.dom.querySelector(".cm-table-wrapper")
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector("table.cm-table")).not.toBeNull()
    view.destroy()
  })
})
