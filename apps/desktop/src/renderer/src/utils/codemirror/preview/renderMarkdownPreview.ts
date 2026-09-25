import {
  buildCodeBlockDecorations,
  buildSearchHighlightDecorations,
  buildTableDecorations,
  buildWYSIWYGDecorations,
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createReadonlyThemeExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "@/utils/codemirror/extensions"
import {resolveCodeLanguage} from "@/utils/codemirror/language"
import {codeHighlightStyle} from "@/utils/codemirror/theme"
import {ensureSyntaxTree, LanguageDescription, syntaxTree} from "@codemirror/language"
import {EditorState, RangeSet, RangeSetBuilder} from "@codemirror/state"
import {Decoration, EditorView} from "@codemirror/view"
import {highlightTree} from "@lezer/highlight"

import type {Extension, Text} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"
import type {SearchMatch} from "@daily/protocol"
import type {Tree} from "@lezer/common"

export type MarkdownPreviewOptions = {isCompact: boolean; matches?: SearchMatch[]}
export type MarkdownPreview = {element: HTMLElement; languagesLoaded: Promise<void> | null}

type EditorClassNames = {root: string; scroller: string; content: string}

const REGULAR_EXTENSIONS: Extension[] = [
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

const COMPACT_EXTENSIONS: Extension[] = [
  createMarkdownLanguageExtension(),
  EditorView.lineWrapping,
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
  createThemeExtension(),
  createWYSIWYGExtension({isReadonly: true}),
  createTablesExtension(),
  createCodeSyntaxExtension(),
  createReadonlyThemeExtension({isCompact: true}),
]

const editorClassNames = new Map<Extension[], EditorClassNames>()

/** The read-only editor's DOM for `content`, drawn without an `EditorView`; `languagesLoaded` resolving means rendering again would add highlighting. */
export function renderMarkdownPreview(content: string, options: MarkdownPreviewOptions): MarkdownPreview {
  const extensions = options.isCompact ? COMPACT_EXTENSIONS : REGULAR_EXTENSIONS
  const classNames = readEditorClassNames(extensions)

  const state = EditorState.create({doc: content, extensions})
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)

  const sources = [
    buildSyntaxDecorations(tree),
    buildWYSIWYGDecorations(state, tree, false),
    buildTableDecorations(state, tree),
    buildCodeBlockDecorations(state, tree),
  ]
  if (options.matches) sources.push(buildSearchHighlightDecorations(options.matches))

  const contentElement = createElement("div", classNames.content)
  drawLines(contentElement, state.doc, sources)

  const scroller = createElement("div", classNames.scroller)
  scroller.append(contentElement)

  const root = createElement("div", classNames.root)
  root.append(scroller)

  return {element: root, languagesLoaded: loadPendingLanguages(state, tree)}
}

function readEditorClassNames(extensions: Extension[]): EditorClassNames {
  const cached = editorClassNames.get(extensions)
  if (cached) return cached

  const view = new EditorView({state: EditorState.create({doc: "", extensions})})
  const classNames = {root: view.dom.className, scroller: view.scrollDOM.className, content: view.contentDOM.className}
  view.destroy()

  editorClassNames.set(extensions, classNames)
  return classNames
}

function buildSyntaxDecorations(tree: Tree): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  highlightTree(tree, codeHighlightStyle, (from, to, classes) => builder.add(from, to, Decoration.mark({class: classes})))
  return builder.finish()
}

function drawLines(content: HTMLElement, doc: Text, sources: DecorationSet[]) {
  const markOf = new WeakMap<Node, Decoration>()
  let line: {element: HTMLElement; hasWidget: boolean} | null = null
  let lastBlock: {isWidget: boolean; isCoveringEnd: boolean; hasBreakAfter: boolean} | null = null
  let pendingAttributes: Record<string, string> | null = null
  let afterHidden: {parent: Node; lastChild: ChildNode | null} | null = null

  const startLine = () => {
    const element = document.createElement("div")
    for (const [name, value] of Object.entries(pendingAttributes ?? {class: "cm-line"})) element.setAttribute(name, value)
    content.append(element)
    line = {element, hasWidget: false}
    lastBlock = {isWidget: false, isCoveringEnd: false, hasBreakAfter: false}
    return line
  }

  const startLineIfNotCovered = () => {
    const isCovered = lastBlock !== null && !lastBlock.hasBreakAfter && (!lastBlock.isWidget || lastBlock.isCoveringEnd)
    if (!isCovered) startLine()
  }

  const endLine = () => {
    if (!line) return
    if (!line.element.textContent && !line.hasWidget) line.element.append(document.createElement("br"))
    line = null
  }

  const breakLine = () => {
    startLineIfNotCovered()
    if (lastBlock) lastBlock.hasBreakAfter = true
    endLine()
  }

  const ensureMarks = (marks: readonly Decoration[], openStart: number) => {
    let parent: Node = (line ?? startLine()).element
    pendingAttributes = null

    for (let i = marks.length - 1; i >= 0; i--) {
      const last = parent.lastChild
      const isAfterHidden = afterHidden?.parent === parent && afterHidden.lastChild === last
      if (openStart > 0 && last && !isAfterHidden && markOf.get(last)?.eq(marks[i])) {
        parent = last
        openStart--
        continue
      }

      const span = createMarkElement(marks[i])
      markOf.set(span, marks[i])
      parent.appendChild(span)
      parent = span
      openStart = 0
    }

    return parent
  }

  RangeSet.spans(sources, 0, doc.length, {
    point(from, to, decoration, active, openStart) {
      const {spec} = decoration

      if (from === to && !spec.widget) {
        if (spec.class || spec.attributes) pendingAttributes = withLineDecoration(pendingAttributes ?? {class: "cm-line"}, spec)
        return
      }

      const widget: HTMLElement | null = spec.widget ? spec.widget.toDOM(null) : null

      if (spec.block) {
        if (decoration.startSide > 0) startLineIfNotCovered()
        if (widget) content.append(widget)
        endLine()
        lastBlock = {isWidget: true, isCoveringEnd: decoration.endSide > 0, hasBreakAfter: false}
        pendingAttributes = null
        return
      }

      const parent = ensureMarks(active, openStart)
      if (widget) {
        parent.appendChild(widget)
        if (line) line.hasWidget = true
      } else {
        afterHidden = {parent, lastChild: parent.lastChild}
      }
    },
    span(from, to, active, openStart) {
      doc
        .sliceString(from, to)
        .split("\n")
        .forEach((text, index) => {
          if (index > 0) {
            breakLine()
            pendingAttributes = null
          }
          if (text) ensureMarks(active, index === 0 ? openStart : active.length).appendChild(document.createTextNode(text))
        })
    },
  })

  startLineIfNotCovered()
  endLine()
}

function withLineDecoration(attributes: Record<string, string>, spec: {class?: string; attributes?: Record<string, string>}) {
  for (const [name, value] of Object.entries(spec.attributes ?? {})) {
    attributes[name] = name === "class" ? `${attributes.class} ${value}` : value
  }
  if (spec.class) attributes.class += ` ${spec.class}`
  return attributes
}

function createMarkElement(mark: Decoration) {
  const element = document.createElement(mark.spec.tagName ?? "span")
  for (const [name, value] of Object.entries<string>(mark.spec.attributes ?? {})) element.setAttribute(name, value)
  if (mark.spec.class) element.className = element.className ? `${element.className} ${mark.spec.class}` : mark.spec.class
  return element
}

function loadPendingLanguages(state: EditorState, tree: Tree): Promise<void> | null {
  const loads: Promise<unknown>[] = []

  tree.iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return
      const info = node.node.getChild("CodeInfo")
      const language = info ? resolveCodeLanguage(state.doc.sliceString(info.from, info.to).split(/\s/)[0]) : null
      if (language instanceof LanguageDescription && !language.support) loads.push(language.load())
      return false
    },
  })

  return loads.length > 0 ? Promise.allSettled(loads).then(() => undefined) : null
}

function createElement(tag: string, className: string) {
  const element = document.createElement(tag)
  element.className = className
  return element
}
