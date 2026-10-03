import {WidgetType} from "@codemirror/view"

/** The one horizontal scrollbar under a raw code block; `extensions/codeBlockScroll.ts` keeps it and the block's lines at the same offset. */
export class CodeBlockScrollbarWidget extends WidgetType {
  eq(other: CodeBlockScrollbarWidget) {
    return other instanceof CodeBlockScrollbarWidget
  }

  get estimatedHeight() {
    return 0
  }

  toDOM() {
    const anchor = document.createElement("div")
    anchor.className = "cm-codeblock-hscroll-anchor"

    const bar = document.createElement("div")
    bar.className = "cm-codeblock-hscroll"
    bar.style.display = "none"

    const spacer = document.createElement("div")
    spacer.className = "cm-codeblock-hscroll-spacer"

    bar.appendChild(spacer)
    anchor.appendChild(bar)
    return anchor
  }

  ignoreEvent() {
    return true
  }
}
