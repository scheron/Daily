import {common, createLowlight} from "lowlight"
import {Lexer, Marked, Tokenizer} from "marked"

import {createCodeCopyButton} from "@/utils/markdown/createCodeCopyButton"
import {createMarkdownImage} from "@/utils/markdown/createMarkdownImage"
import {decodeMarkdownImageAlt} from "@/utils/markdown/decodeMarkdownImageAlt"
import {Node as TipTapNode} from "@tiptap/core"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import {TaskItem, TaskList} from "@tiptap/extension-list"
import Paragraph from "@tiptap/extension-paragraph"
import {Table, TableCell, TableHeader, TableKit} from "@tiptap/extension-table"
import {Markdown} from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import {formatMarkdownDestination} from "./formatMarkdownDestination"
import {formatMarkdownImage} from "./formatMarkdownImage"

import type {JSONContent} from "@tiptap/core"
import type {marked, MarkedOptions} from "marked"

export function createDailyMarkdownExtensions() {
  return [
    StarterKit.configure({codeBlock: false, link: false, paragraph: false, trailingNode: false, underline: false}),
    createLiteralHtmlMarkdown(),
    LiteralHtmlBlock,
    LiteralHtmlInline,
    DailyParagraph,
    DailyLink,
    TaskList,
    TaskItem.configure({nested: true, HTMLAttributes: {"data-type": "taskItem"}}),
    TableKit.configure({table: false, tableCell: false, tableHeader: false}),
    DailyTable,
    TableCell.extend({content: "paragraph"}),
    TableHeader.extend({content: "paragraph"}),
    DailyCodeBlock,
    DailyImage,
  ]
}

const DailyParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    const tokens = token.tokens ?? []
    if (tokens.length === 1 && tokens[0].type === "image") return helpers.createNode("paragraph", undefined, helpers.parseInline(tokens))
    return this.parent?.(token, helpers) ?? helpers.createNode("paragraph", undefined, helpers.parseInline(tokens))
  },

  renderMarkdown(node, helpers, context) {
    const markdown = this.parent?.(node, helpers, context) ?? ""
    return markdown
      .replace(/^([ \t]{0,3})(#{1,6}|[+-])(?=[ \t]|$)/gm, "$1\\$2")
      .replace(/^([ \t]{0,3})(={1,}|-{3,})(?=[ \t]*$)/gm, "$1\\$2")
      .replace(/^([ \t]{0,3}\d{1,9})([.)])(?=[ \t]|$)/gm, "$1\\$2")
  },
})

const DailyLink = Link.extend({
  renderMarkdown(node, helpers) {
    const label = helpers.renderChildren(node)
    const href = node.attrs?.href ?? ""
    return `[${label}](${formatMarkdownDestination(href, node.attrs?.title)})`
  },
}).configure({openOnClick: false, markdownLinks: true})

const DailyCodeBlock = CodeBlockLowlight.extend({
  renderMarkdown(node, helpers) {
    const language = node.attrs?.language ?? ""
    const code = helpers.renderChildren(node.content ?? [])
    const marker = language.includes("`") ? "~" : "`"
    const fenceRuns = marker === "~" ? /^ {0,3}(~+)/gm : /^ {0,3}(`+)/gm
    let length = 3
    for (const match of code.matchAll(fenceRuns)) length = Math.max(length, match[1].length + 1)
    const fence = marker.repeat(length)
    return `${fence}${language}\n${code}\n${fence}`
  },

  addNodeView() {
    const languagePrefix = this.options.languageClassPrefix ?? ""
    return ({node}) => {
      const dom = document.createElement("div")
      dom.className = "daily-markdown-code-block"
      const pre = document.createElement("pre")
      const code = document.createElement("code")
      let currentNode = node
      const copy = createCodeCopyButton(() => currentNode.textContent)

      pre.append(code)
      dom.append(copy, pre)
      sync()

      function sync() {
        const language = currentNode.attrs.language?.split(/\s/, 1)[0]
        code.className = language ? `${languagePrefix}${language}` : ""
        copy.hidden = !currentNode.textContent.trim()
      }

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== node.type) return false
          currentNode = updated
          sync()
          return true
        },
        stopEvent: (event) => event.target instanceof Node && copy.contains(event.target),
        ignoreMutation: (mutation) => mutation.type !== "selection" && !code.contains(mutation.target),
      }
    }
  },
}).configure({lowlight: createLowlight(common)})

const DailyImage = Image.extend({
  parseMarkdown(token, helpers) {
    return helpers.createNode("image", {src: token.href, alt: decodeMarkdownImageAlt(token.text ?? ""), title: token.title})
  },

  renderMarkdown(node) {
    return formatMarkdownImage(node.attrs?.src ?? "", node.attrs?.alt ?? "", node.attrs?.title)
  },

  addNodeView() {
    return ({node}) => {
      const {src, alt, title} = node.attrs
      if (typeof src !== "string" || !src) return {dom: document.createElement("span")}

      const dom = createMarkdownImage({url: src, alt: String(alt ?? ""), title: typeof title === "string" ? title : undefined})
      dom.contentEditable = "false"
      return {dom, stopEvent: (event) => event.target instanceof Element && !!event.target.closest("button")}
    }
  },
}).configure({inline: true})

const DailyTable = Table.extend({
  addKeyboardShortcuts() {
    return {...this.parent?.(), "Shift-Enter": () => this.editor.isActive("table")}
  },

  renderMarkdown(node, helpers) {
    const rows = node.content?.map((row) => row.content ?? []) ?? []
    const columnCount = rows.reduce((largest, row) => Math.max(largest, row.length), 0)
    if (!columnCount) return ""

    const header = rows[0].some((cell) => cell.type === "tableHeader") ? rows.shift()! : []
    const divider = Array.from({length: columnCount}, (_, index) => {
      const align = header[index]?.attrs?.align ?? rows.find((row) => row[index]?.attrs?.align)?.[index]?.attrs?.align
      if (align === "center") return ":---:"
      if (align === "right") return "---:"
      if (align === "left") return ":---"
      return "---"
    })
    const formatRow = (row: JSONContent[]) =>
      printRow(Array.from({length: columnCount}, (_, index) => renderCell(helpers.renderChildren(row[index]?.content ?? []))))

    return `\n${[formatRow(header), printRow(divider), ...rows.map(formatRow)].join("\n")}\n`

    function renderCell(text: string) {
      return text
        .replace(/\r?\n/g, " ")
        .trim()
        .replace(/\\.|\|/g, (token) => (token === "|" ? "\\|" : token))
    }

    function printRow(cells: string[]) {
      return `| ${cells.join(" | ")} |`
    }
  },
}).configure({renderWrapper: true})

function createLiteralHtmlMarkdown() {
  const instance = new Marked()
  instance.Lexer = LiteralHtmlLexer
  instance.lexer = (source, options = instance.defaults) => new LiteralHtmlLexer(options).lex(source)
  return Markdown.configure({marked: instance as unknown as typeof marked})
}

const LiteralHtmlBlock = TipTapNode.create({
  name: "literalHtmlBlock",
  group: "block",
  content: "text*",
  code: true,

  parseMarkdown(token, helpers) {
    const source = token.raw?.replace(/\n+$/, "") ?? ""
    return helpers.createNode(this.name, undefined, source ? [helpers.createTextNode(source)] : [])
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [])
  },

  parseHTML() {
    return [{tag: "div.daily-markdown-literal-block", preserveWhitespace: "full"}]
  },

  renderHTML() {
    return ["div", {class: "daily-markdown-literal-block"}, 0]
  },
})

const LiteralHtmlInline = TipTapNode.create({
  name: "literalHtmlInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {source: {default: "", rendered: false}}
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(this.name, {source: token.raw ?? ""})
  },

  renderMarkdown(node) {
    return node.attrs?.source ?? ""
  },

  parseHTML() {
    return [{tag: "span.daily-markdown-literal-inline", getAttrs: (element) => ({source: element.textContent ?? ""})}]
  },

  renderText({node}) {
    return String(node.attrs.source)
  },

  renderHTML({node}) {
    return ["span", {class: "daily-markdown-literal-inline"}, String(node.attrs.source)]
  },
})

class LiteralHtmlLexer<ParserOutput = string, RendererOutput = string> extends Lexer<ParserOutput, RendererOutput> {
  constructor(options?: MarkedOptions<ParserOutput, RendererOutput>) {
    super({...options, tokenizer: new LiteralHtmlTokenizer(options)})
  }
}

class LiteralHtmlTokenizer<ParserOutput, RendererOutput> extends Tokenizer<ParserOutput, RendererOutput> {
  html(source: string) {
    const token = super.html(source)
    return token && Object.assign(token, {type: LiteralHtmlBlock.name})
  }

  tag(source: string) {
    const token = super.tag(source)
    return token && Object.assign(token, {type: LiteralHtmlInline.name})
  }
}
