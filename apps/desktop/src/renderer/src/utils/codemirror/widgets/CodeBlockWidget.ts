import {resolveCodeLanguage} from "@/utils/codemirror/language"
import {codeHighlightStyle} from "@/utils/codemirror/theme"
import {LanguageDescription} from "@codemirror/language"
import {WidgetType} from "@codemirror/view"
import {highlightTree} from "@lezer/highlight"
import {CopyButtonWidget} from "./CopyButtonWidget"

import type {EditorView} from "@codemirror/view"
import type {Parser} from "@lezer/common"

const HIGHLIGHT_CLASS = "cm-search-highlight"
const LINE_HEIGHT_PX = 25.2
const VERTICAL_PADDING_PX = 32

export type CodeBlockWidgetOptions = {
  /** `[from, to)` offsets into `code` drawn as search matches. */
  highlights?: readonly (readonly [number, number])[]
  /** Long lines are cut off instead of scrolling. */
  isClipped?: boolean
}

/** A fenced block drawn as one horizontally scrolling surface; a grammar that is not loaded yet leaves the code as plain text. */
export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly language: string | null,
    readonly options: CodeBlockWidgetOptions = {},
  ) {
    super()
  }

  eq(other: CodeBlockWidget) {
    return (
      other.code === this.code &&
      other.language === this.language &&
      other.options.isClipped === this.options.isClipped &&
      JSON.stringify(other.options.highlights ?? []) === JSON.stringify(this.options.highlights ?? [])
    )
  }

  get estimatedHeight() {
    return this.code.split("\n").length * LINE_HEIGHT_PX + VERTICAL_PADDING_PX
  }

  toDOM(view: EditorView | null) {
    const block = document.createElement("div")
    block.className = this.options.isClipped ? "cm-codeblock-widget cm-codeblock-clip" : "cm-codeblock-widget"
    block.setAttribute("data-language", this.language || "plaintext")

    if (this.code.trim().length > 0) block.appendChild(new CopyButtonWidget(this.code).toDOM())

    const scroller = document.createElement("div")
    scroller.className = "cm-codeblock-scroll"

    const body = document.createElement("div")
    body.className = "cm-codeblock-body"
    body.append(...buildLines(this.code, this.language, this.options.highlights ?? []))

    scroller.appendChild(body)
    block.appendChild(scroller)

    if (view) {
      block.addEventListener("mousedown", (event) => {
        const lineElement = (event.target as Element).closest<HTMLElement>(".cm-codeblock-text-line")
        if (event.button !== 0 || !lineElement) return

        event.preventDefault()
        const index = Array.from(body.children).indexOf(lineElement)
        const fenceLine = view.state.doc.lineAt(view.posAtDOM(block))
        const line = view.state.doc.line(Math.min(fenceLine.number + 1 + index, view.state.doc.lines))
        view.dispatch({selection: {anchor: line.from}, scrollIntoView: true})
        view.focus()
      })
    }

    return block
  }

  ignoreEvent() {
    return true
  }
}

function buildLines(code: string, language: string | null, highlights: readonly (readonly [number, number])[]): HTMLElement[] {
  const lines: HTMLElement[] = []
  const startLine = () => {
    const line = document.createElement("div")
    line.className = "cm-codeblock-text-line"
    lines.push(line)
    return line
  }

  let current = startLine()
  const append = (text: string, classes: string) => {
    text.split("\n").forEach((part, index) => {
      if (index > 0) current = startLine()
      if (part.length === 0) return
      if (!classes) return void current.append(document.createTextNode(part))
      const span = document.createElement("span")
      span.className = classes
      span.textContent = part
      current.appendChild(span)
    })
  }

  const appendSegment = (from: number, to: number, classes: string) => {
    let position = from
    const cuts = highlights
      .flatMap(([start, end]) => [start, end])
      .filter((cut) => cut > from && cut < to)
      .sort((a, b) => a - b)
    for (const cut of [...cuts, to]) {
      if (cut > position) append(code.slice(position, cut), isHighlighted(position, highlights) ? joinClasses(classes, HIGHLIGHT_CLASS) : classes)
      position = cut
    }
  }

  const parser = language ? resolveParser(language) : null
  if (!parser) {
    appendSegment(0, code.length, "")
    return lines
  }

  let position = 0
  highlightTree(parser.parse(code), codeHighlightStyle, (from, to, classes) => {
    if (from > position) appendSegment(position, from, "")
    appendSegment(from, to, classes)
    position = to
  })
  if (position < code.length) appendSegment(position, code.length, "")

  return lines
}

function isHighlighted(position: number, highlights: readonly (readonly [number, number])[]): boolean {
  return highlights.some(([start, end]) => position >= start && position < end)
}

function joinClasses(classes: string, extra: string): string {
  return classes ? `${classes} ${extra}` : extra
}

function resolveParser(language: string): Parser | null {
  const resolved = resolveCodeLanguage(language)
  if (!resolved) return null
  if (resolved instanceof LanguageDescription) return resolved.support?.language.parser ?? null
  return resolved.parser
}
