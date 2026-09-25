import {WidgetType} from "@codemirror/view"

import type {EditorView} from "@codemirror/view"

type Align = "left" | "center" | "right" | ""

/** Cell text is rendered as DOM nodes, never through `innerHTML`, so a cell cannot inject markup. */
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

  toDOM(view: EditorView | null) {
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

    if (view) {
      wrapper.addEventListener("mousedown", (event) => {
        event.preventDefault()
        view.dispatch({selection: {anchor: this.from}, scrollIntoView: true})
        view.focus()
      })
    }

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
    const hasLeftColon = cell.startsWith(":")
    const hasRightColon = cell.endsWith(":")
    if (hasLeftColon && hasRightColon) return "center"
    if (hasRightColon) return "right"
    if (hasLeftColon) return "left"
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

function renderInlineMarkdown(text: string): Node[] {
  const nodes: Node[] = []
  let rest = text

  while (rest.length > 0) {
    const match =
      /(?<code>`[^`]+`)|(?<strong>\*\*[\s\S]+?\*\*|(?<!\w)__[\s\S]+?__(?!\w))|(?<emphasis>\*[\s\S]+?\*|(?<!\w)_[\s\S]+?_(?!\w))|(?<strikethrough>~~[\s\S]+?~~)|(?<link>\[(?<label>[^\]]+)\]\([^)]+\))/.exec(
        rest,
      )
    if (!match?.groups) {
      nodes.push(document.createTextNode(rest))
      break
    }

    const token = match[0]
    const groups = match.groups

    if (match.index > 0) nodes.push(document.createTextNode(rest.slice(0, match.index)))

    if (groups.code) {
      nodes.push(styledSpan("cm-code", [document.createTextNode(token.slice(1, -1))]))
    } else if (groups.strong) {
      nodes.push(wrap("strong", "cm-strong", token.slice(2, -2)))
    } else if (groups.emphasis) {
      nodes.push(wrap("em", "cm-emphasis", token.slice(1, -1)))
    } else if (groups.strikethrough) {
      const strike = wrap("span", "", token.slice(2, -2))
      strike.style.textDecoration = "line-through"
      nodes.push(strike)
    } else if (groups.link) {
      nodes.push(styledSpan("cm-link", [document.createTextNode(groups.label ?? token)]))
    }

    rest = rest.slice(match.index + token.length)
  }

  return nodes
}

function wrap(tag: string, className: string, inner: string): HTMLElement {
  const element = document.createElement(tag)
  if (className) element.className = className
  element.append(...renderInlineMarkdown(inner))
  return element
}

function styledSpan(className: string, children: Node[]): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = className
  span.append(...children)
  return span
}
