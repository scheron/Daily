import {Annotation, Transaction} from "@codemirror/state"
import {ViewPlugin} from "@codemirror/view"

import type {EditorView, PluginValue, ViewUpdate} from "@codemirror/view"

const caretLayerRefresh = Annotation.define<boolean>()

const WIDGET_SELECTOR = ".cm-codeblock-widget"
const RAW_LINE_SELECTOR = ".cm-codeblock-raw"
const BAR_SELECTOR = ".cm-codeblock-hscroll"
const WIDGET_SCROLLER_SELECTOR = ".cm-codeblock-scroll"
const SPACER_SELECTOR = ".cm-codeblock-hscroll-spacer"
const WIDTH_VARIABLE = "--cm-codeblock-scroll-width"
const OFFSET_VARIABLE = "--cm-codeblock-scroll-left"

type ScrollBlock = {
  isRaw: boolean
  head: HTMLElement
  tail: HTMLElement
  surfaces: HTMLElement[]
  bar: HTMLElement | null
}

class CodeBlockScroll implements PluginValue {
  private offsets = new Map<number, number>()
  private isRevealPending = false
  private readonly measureRequest = {read: () => null, write: () => this.sync()}

  constructor(private readonly view: EditorView) {
    view.contentDOM.addEventListener("scroll", this.onScroll, true)
    view.contentDOM.addEventListener("wheel", this.onWheel, {passive: false})
    view.requestMeasure(this.measureRequest)
  }

  update(update: ViewUpdate) {
    if (update.docChanged) this.remapOffsets(update)
    const isCaretMove = update.docChanged || (update.selectionSet && !update.transactions.every((tr) => tr.annotation(caretLayerRefresh)))
    if (isCaretMove) this.isRevealPending = true

    if (isCaretMove && !update.docChanged && this.revealCaret()) this.isRevealPending = false
    if (update.geometryChanged || update.viewportChanged) this.view.requestMeasure(this.measureRequest)
  }

  docViewUpdate() {
    this.sync()
    if (this.isRevealPending) this.revealCaret()
    this.isRevealPending = false
  }

  destroy() {
    this.view.contentDOM.removeEventListener("scroll", this.onScroll, true)
    this.view.contentDOM.removeEventListener("wheel", this.onWheel)
  }

  private readonly onScroll = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const block = this.collectBlocks().find((each) => each.surfaces.includes(target) || each.bar === target)
    if (!block) return

    const key = this.keyOf(block)
    const stored = this.offsets.get(key)
    if (stored !== undefined && Math.abs(stored - target.scrollLeft) < 1) return

    this.moveBlock(block, key, target.scrollLeft, target)
    this.redrawCaretLayer(block)
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return

    const line = event.target instanceof Element ? event.target.closest<HTMLElement>(RAW_LINE_SELECTOR) : null
    if (!line) return

    const block = this.collectBlocks().find((each) => each.surfaces.includes(line))
    if (!block) return

    event.preventDefault()
    this.moveBlock(block, this.keyOf(block), line.scrollLeft + event.deltaX)
    this.redrawCaretLayer(block)
  }

  private sync() {
    for (const block of this.collectBlocks()) {
      if (block.isRaw) this.fitBlockWidth(block)
      const offset = this.offsets.get(this.keyOf(block))
      if (offset !== undefined) applyOffset(block, offset)
    }
  }

  private revealCaret(): boolean {
    const {head} = this.view.state.selection.main
    const {node, offset} = this.view.domAtPos(head)
    const element = node instanceof Element ? node : node.parentElement
    const line = element?.closest<HTMLElement>(RAW_LINE_SELECTOR)
    if (!line || !this.view.contentDOM.contains(line)) return false

    const block = this.collectBlocks().find((each) => each.surfaces.includes(line))
    if (!block) return false

    if (line.clientWidth === 0) return true

    const lineRect = line.getBoundingClientRect()
    const margin = parseFloat(getComputedStyle(line).paddingLeft) || 0
    const caretX = readCaretX(node, offset) ?? lineRect.left + margin - line.scrollLeft

    const visibleLeft = lineRect.left + margin
    const visibleRight = lineRect.left + line.clientWidth - margin
    let delta = 0
    if (caretX < visibleLeft) delta = caretX - visibleLeft
    else if (caretX > visibleRight) delta = caretX - visibleRight
    if (delta !== 0) this.moveBlock(block, this.keyOf(block), line.scrollLeft + delta)

    return true
  }

  private moveBlock(block: ScrollBlock, key: number, left: number, origin?: HTMLElement) {
    const reference = origin ?? block.surfaces[0]
    applyOffset(block, Math.max(0, left), origin)
    this.offsets.set(key, reference ? reference.scrollLeft : left)
  }

  private redrawCaretLayer(block: ScrollBlock) {
    if (!block.isRaw) return

    const {doc, selection} = this.view.state
    const from = doc.lineAt(this.view.posAtDOM(block.head)).from
    const to = doc.lineAt(this.view.posAtDOM(block.tail)).to
    if (!selection.ranges.some((range) => range.head >= from && range.head <= to)) return

    this.view.dispatch({selection, annotations: [Transaction.addToHistory.of(false), caretLayerRefresh.of(true)]})
  }

  private fitBlockWidth(block: ScrollBlock) {
    const first = block.surfaces[0]
    if (!first) return

    const style = getComputedStyle(first)
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    const textWidth = Math.max(0, ...block.surfaces.map(measureTextWidth))

    for (const line of block.surfaces) line.style.setProperty(WIDTH_VARIABLE, `${textWidth}px`)

    if (!block.bar) return
    const extent = textWidth + padding
    block.bar.querySelector<HTMLElement>(SPACER_SELECTOR)?.style.setProperty("width", `${extent}px`)
    block.bar.style.display = extent > first.clientWidth + 1 ? "" : "none"
  }

  private collectBlocks(): ScrollBlock[] {
    const blocks: ScrollBlock[] = []
    let current: ScrollBlock | null = null

    for (const element of Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}, ${RAW_LINE_SELECTOR}, ${BAR_SELECTOR}`),
    )) {
      if (element.matches(WIDGET_SELECTOR)) {
        const scroller = element.querySelector<HTMLElement>(WIDGET_SCROLLER_SELECTOR)
        blocks.push({isRaw: false, head: element, tail: element, surfaces: scroller ? [scroller] : [], bar: null})
        current = null
      } else if (element.matches(BAR_SELECTOR)) {
        if (current) current.bar = element
      } else {
        if (!current || element.classList.contains("cm-codeblock-first")) {
          current = {isRaw: true, head: element, tail: element, surfaces: [], bar: null}
          blocks.push(current)
        }
        current.surfaces.push(element)
        current.tail = element
      }
    }

    return blocks
  }

  private keyOf(block: ScrollBlock): number {
    return this.view.state.doc.lineAt(this.view.posAtDOM(block.head)).from
  }

  private remapOffsets(update: ViewUpdate) {
    const next = new Map<number, number>()
    for (const [key, offset] of this.offsets) {
      const mapped = update.state.doc.lineAt(update.changes.mapPos(key, -1))
      if (/^[\s>]*(`{3,}|~{3,})/.test(mapped.text)) next.set(mapped.from, offset)
    }
    this.offsets = next
  }
}

const codeBlockScrollPlugin = ViewPlugin.fromClass(CodeBlockScroll)

/** Keeps every line of a raw fenced block, its bar and the widget it turns into at one horizontal offset. */
export function createCodeBlockScrollExtension() {
  return codeBlockScrollPlugin
}

function applyOffset(block: ScrollBlock, left: number, except?: HTMLElement) {
  for (const surface of block.surfaces) {
    if (surface !== except && surface.scrollLeft !== left) surface.scrollLeft = left
  }
  if (block.bar && block.bar !== except && block.bar.scrollLeft !== left) block.bar.scrollLeft = left

  if (!block.isRaw) return
  const actual = (except ?? block.surfaces[0])?.scrollLeft ?? left
  for (const surface of block.surfaces) surface.style.setProperty(OFFSET_VARIABLE, `${actual}px`)
}

function measureTextWidth(line: HTMLElement): number {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let first: Text | null = null
  let last: Text | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node as Text).length) continue
    first ??= node as Text
    last = node as Text
  }
  if (!first || !last) return 0

  const range = document.createRange()
  range.setStart(first, 0)
  range.setEnd(last, last.length)
  return range.getBoundingClientRect().width
}

function readCaretX(node: Node, offset: number): number | null {
  if (node.nodeType !== Node.TEXT_NODE) return null
  const text = node as Text
  if (text.length === 0) return null

  const range = document.createRange()
  if (offset > 0) {
    range.setStart(text, offset - 1)
    range.setEnd(text, offset)
    return range.getBoundingClientRect().right
  }
  range.setStart(text, 0)
  range.setEnd(text, 1)
  return range.getBoundingClientRect().left
}
