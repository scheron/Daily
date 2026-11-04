import {getDefaults, Lexer} from "marked"

import {appendMarkdownCodeLine} from "./appendMarkdownCodeLine"
import {createCodeCopyButton} from "./createCodeCopyButton"
import {createMarkdownImage} from "./createMarkdownImage"
import {createPreviewHighlights} from "./createPreviewHighlights"
import {decodeMarkdownImageAlt} from "./decodeMarkdownImageAlt"
import {renderPreviewCode} from "./renderPreviewCode"

import type {SearchMatch} from "@daily/protocol"
import type {MarkedToken, Token, Tokens} from "marked"

import "./markdownPreview.css"

export type MarkdownPreviewOptions = {isCompact: boolean; matches?: SearchMatch[]; isCodeClipped?: boolean}
type MarkdownPreview = {element: HTMLElement; languagesLoaded: Promise<void> | null}

export function renderMarkdownPreview(source: string, options: MarkdownPreviewOptions): MarkdownPreview {
  const tokens = Lexer.lex(source, {...getDefaults(), gfm: true, breaks: true})
  const highlights = createPreviewHighlights(source, tokens, options.matches)
  const loadingLanguages = new Set<Promise<void>>()
  const root = element("div", options.isCompact ? "markdown-preview markdown-preview-compact" : "markdown-preview")
  const content = element("div", "markdown-preview-content")
  root.append(content)

  appendBlocks(content, tokens)
  if (!content.firstChild) appendEmptyLine(content)

  return {
    element: root,
    languagesLoaded: loadingLanguages.size ? Promise.allSettled(loadingLanguages).then(() => undefined) : null,
  }

  function appendBlocks(parent: HTMLElement, blocks: readonly Token[], nested = false) {
    let pendingBreaks = 0
    let hasBlock = false
    for (const token of blocks as readonly MarkedToken[]) {
      if (token.type === "space") {
        pendingBreaks += token.raw.split("\n").length - 1
        continue
      }
      if (token.type === "checkbox") continue

      for (let i = Number(hasBlock); i < pendingBreaks; i++) appendEmptyLine(parent)
      appendBlock(parent, token, nested)
      pendingBreaks = token.raw.match(/\n+$/)?.[0].length ?? 0
      hasBlock = true
    }
    for (let i = 0; i < pendingBreaks; i++) appendEmptyLine(parent)
  }

  function appendBlock(parent: HTMLElement, token: MarkedToken, nested: boolean) {
    switch (token.type) {
      case "heading": {
        const heading = element("h" + token.depth, "markdown-line")
        appendInline(heading, token.tokens)
        parent.append(heading)
        return
      }
      case "paragraph":
      case "text": {
        const paragraph = element("p", "markdown-line")
        if (token.tokens) appendInline(paragraph, token.tokens)
        else highlights.appendText(paragraph, token, token.text)
        parent.append(paragraph)
        return
      }
      case "blockquote": {
        const quote = element("blockquote")
        appendBlocks(quote, token.tokens, true)
        parent.append(quote)
        return
      }
      case "hr":
        parent.append(element("hr", "markdown-divider"))
        return
      case "list":
        parent.append(drawList(token))
        return
      case "table":
        parent.append(drawTable(token))
        return
      case "code": {
        if (nested || isRawCode(token)) {
          appendRawCode(parent, token)
          return
        }
        const {element: code, languageLoaded} = renderPreviewCode(token, {
          isClipped: options.isCompact || !!options.isCodeClipped,
          ranges: highlights.rangesForCode(token),
        })
        if (languageLoaded) loadingLanguages.add(languageLoaded)
        parent.append(code)
        return
      }
      default:
        appendLiteral(parent, token)
    }

    function isRawCode(token: Tokens.Code) {
      const firstBreak = token.raw.indexOf("\n")
      const opener = token.raw.match(/^[ \t]{0,3}(\x60{3,}|~{3,})/)?.[1]
      if (!opener || token.codeBlockStyle === "indented" || !token.raw.startsWith(opener)) return true
      if (firstBreak < 0) return true

      const lastLine = token.raw.trimEnd().split("\n").at(-1)?.trim() ?? ""
      if (lastLine.length < opener.length || token.raw.trimEnd().length <= firstBreak) return true
      return lastLine !== opener[0].repeat(lastLine.length)
    }
  }

  function appendInline(parent: HTMLElement, inline: readonly Token[], inTable = false) {
    for (const token of inline as readonly MarkedToken[]) {
      switch (token.type) {
        case "text":
          if (token.tokens) appendInline(parent, token.tokens, inTable)
          else highlights.appendText(parent, token, token.text)
          break
        case "escape":
          highlights.appendText(parent, token, token.text)
          break
        case "html":
          highlights.appendText(parent, token, token.raw)
          break
        case "br":
          parent.append(element("br"))
          break
        case "codespan": {
          const code = element("code", "markdown-inline-code")
          highlights.appendText(code, token, token.text)
          parent.append(code)
          break
        }
        case "strong":
        case "em":
        case "del": {
          const formatted = element(token.type)
          appendInline(formatted, token.tokens, inTable)
          parent.append(formatted)
          break
        }
        case "link":
          appendLink(parent, token, inTable)
          break
        case "image":
          appendImage(parent, token)
          break
        default:
          highlights.appendText(parent, token, token.raw)
      }
    }
  }

  function appendLiteral(parent: HTMLElement, token: MarkedToken) {
    const line = element("div", "markdown-line")
    highlights.appendText(line, token, token.raw.replace(/\n+$/, ""))
    parent.append(line)
  }

  function appendRawCode(parent: HTMLElement, token: Tokens.Code) {
    const block = element(
      "div",
      options.isCompact || options.isCodeClipped ? "markdown-raw-code-block markdown-code-clipped" : "markdown-raw-code-block",
    )
    const scroll = element("div", "markdown-code-scroll")
    const highlighted = document.createElement("div")
    highlights.appendText(highlighted, token, token.raw.replace(/\n+$/, ""))
    let line = appendMarkdownCodeLine(scroll)

    for (const part of Array.from(highlighted.childNodes)) {
      const rows = (part.textContent ?? "").split("\n")
      for (const [index, text] of rows.entries()) {
        if (index > 0) line = appendMarkdownCodeLine(scroll)
        if (!text) continue
        const node = part.cloneNode(false)
        node.textContent = text
        line.append(node)
      }
    }

    if (token.text.trim()) block.append(createCodeCopyButton(() => token.text))
    block.append(scroll)
    parent.append(block)
  }

  function appendLink(parent: HTMLElement, token: Tokens.Link, inTable: boolean) {
    const clickable =
      !inTable && /^\[[\s\S]*\]\([\s\S]*\)$/.test(token.raw) && ["https:", "http:", "mailto:"].includes(URL.parse(token.href)?.protocol ?? "")
    if (!clickable) {
      const label = element("span", "markdown-link-label")
      appendInline(label, token.tokens, inTable)
      parent.append(label)
      return
    }

    const link = document.createElement("a")
    link.href = token.href
    if (token.title) link.title = token.title
    appendInline(link, token.tokens)
    link.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      void window.BridgeIPC["shell:open-external"](token.href)
    })
    parent.append(link)
  }

  function appendImage(parent: HTMLElement, token: Tokens.Image) {
    const protocol = URL.parse(token.href)?.protocol
    if (protocol && !["https:", "http:", "data:", "blob:", "file:", "temp:", "daily:"].includes(protocol)) {
      highlights.appendText(parent, token, token.text)
      return
    }

    parent.append(createMarkdownImage({url: token.href, alt: decodeMarkdownImageAlt(token.text), title: token.title ?? undefined}))
  }

  function drawList(token: Tokens.List) {
    const list = document.createElement(token.ordered ? "ol" : "ul")
    if (token.start !== "" && token.start !== 1) list.setAttribute("start", String(token.start))
    for (const item of token.items) {
      const li = document.createElement("li")
      if (item.task) {
        const checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = !!item.checked
        checkbox.disabled = true
        checkbox.tabIndex = -1
        const row = element("div", "markdown-task-row")
        const body = document.createElement("div")
        appendBlocks(body, item.tokens, true)
        row.append(checkbox, body)
        li.append(row)
      } else {
        appendBlocks(li, item.tokens, true)
      }
      list.append(li)
    }
    return list
  }

  function drawTable(token: Tokens.Table) {
    const wrapper = element("div", "markdown-table-wrapper")
    const table = document.createElement("table")
    table.createTHead().append(drawRow(token.header, "th"))
    if (token.rows.length) {
      const body = table.createTBody()
      for (const row of token.rows) body.append(drawRow(row, "td"))
    }
    wrapper.append(table)
    return wrapper
  }

  function drawRow(cells: Tokens.TableCell[], tag: "th" | "td") {
    const row = document.createElement("tr")
    for (const cell of cells) {
      const element = document.createElement(tag)
      if (cell.align) element.style.textAlign = cell.align
      appendInline(element, cell.tokens, true)
      row.append(element)
    }
    return row
  }
}

function element(tag: string, className?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function appendEmptyLine(parent: HTMLElement) {
  const line = element("div", "markdown-line")
  line.append(element("br"))
  parent.append(line)
}
