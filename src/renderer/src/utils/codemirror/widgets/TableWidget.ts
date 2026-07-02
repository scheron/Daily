import {renderInlineMarkdown} from "@/utils/codemirror/inlineMarkdown"

import {WidgetType} from "@codemirror/view"

import type {EditorView} from "@codemirror/view"

type Align = "left" | "center" | "right" | ""

/**
 * Renders a GFM markdown table as a real `<table>` (wrapped in a
 * horizontally-scrollable container) when the caret is not inside it
 * (Obsidian-style live preview). Clicking the table moves the caret into its
 * source so it becomes editable again.
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
  ) {
    super()
  }

  eq(other: TableWidget) {
    return other.source === this.source && other.from === this.from
  }

  toDOM(view: EditorView) {
    const lines = this.source.split("\n").filter((line) => line.trim().length > 0)

    const wrapper = document.createElement("div")
    wrapper.className = "cm-table-wrapper"

    const table = document.createElement("table")
    table.className = "cm-table"

    const aligns = lines.length > 1 ? parseAligns(lines[1]) : []

    if (lines.length > 0) {
      const thead = document.createElement("thead")
      thead.appendChild(buildRow(parseCells(lines[0]), aligns, "th"))
      table.appendChild(thead)
    }

    const bodyLines = lines.slice(2)
    if (bodyLines.length > 0) {
      const tbody = document.createElement("tbody")
      for (const line of bodyLines) tbody.appendChild(buildRow(parseCells(line), aligns, "td"))
      table.appendChild(tbody)
    }

    wrapper.appendChild(table)

    wrapper.addEventListener("mousedown", (event) => {
      event.preventDefault()
      view.dispatch({selection: {anchor: this.from}, scrollIntoView: true})
      view.focus()
    })

    return wrapper
  }

  ignoreEvent() {
    return true
  }
}

function parseCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"))
}

function parseAligns(delimiterLine: string): Align[] {
  return parseCells(delimiterLine).map((cell) => {
    const left = cell.startsWith(":")
    const right = cell.endsWith(":")
    if (left && right) return "center"
    if (right) return "right"
    if (left) return "left"
    return ""
  })
}

function buildRow(cells: string[], aligns: Align[], tag: "th" | "td"): HTMLTableRowElement {
  const row = document.createElement("tr")
  cells.forEach((cell, index) => {
    const element = document.createElement(tag)
    element.className = tag === "th" ? "cm-table-cell cm-table-header" : "cm-table-cell"
    const align = aligns[index]
    if (align) element.style.textAlign = align
    element.append(...renderInlineMarkdown(cell))
    row.appendChild(element)
  })
  return row
}
