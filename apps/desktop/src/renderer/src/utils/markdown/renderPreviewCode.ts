import {common, createLowlight} from "lowlight"

import {WHITESPACE_REGEX} from "@/constants/regex"
import {appendHighlightedText} from "./appendHighlightedText"
import {appendMarkdownCodeLine} from "./appendMarkdownCodeLine"
import {createCodeCopyButton} from "./createCodeCopyButton"

import type {LanguageFn} from "highlight.js"
import type {Tokens} from "marked"
import type {MarkdownOffsetRange} from "./appendHighlightedText"

type CodeNode = ReturnType<typeof lowlight.highlight>["children"][number]

const lowlight = createLowlight(
  Object.fromEntries(
    ["cpp", "css", "go", "java", "javascript", "json", "markdown", "php", "python", "rust", "sql", "typescript", "xml", "yaml"].map((name) => [
      name,
      common[name],
    ]),
  ),
)
const languageLoaders = new Map(
  Object.entries(
    import.meta.glob<{default: LanguageFn}>([
      "../../../../../node_modules/highlight.js/es/languages/*.js",
      "!../../../../../node_modules/highlight.js/es/languages/*.js.js",
    ]),
  ).map(([path, load]) => [path.slice(path.lastIndexOf("/") + 1, -3), load]),
)
const pending = new Map<string, Promise<void>>()

export function renderPreviewCode(token: Tokens.Code, options: {isClipped: boolean; isReadOnly: boolean; ranges: readonly MarkdownOffsetRange[]}) {
  const block = document.createElement("div")
  block.className = options.isClipped ? "markdown-code-block markdown-code-clipped" : "markdown-code-block"
  const language = languageName(token)
  block.dataset.language = language || "plaintext"
  if (!options.isReadOnly && token.text.trim()) block.append(createCodeCopyButton(() => token.text))

  const scroller = document.createElement("div")
  scroller.className = "markdown-code-scroll"
  block.append(scroller)

  let line = appendMarkdownCodeLine(scroller)
  let offset = 0
  if (language && lowlight.registered(language)) {
    for (const node of lowlight.highlight(language, token.text).children) appendSyntaxNode(node, [], appendRun)
  } else {
    appendRun(token.text, [])
  }
  if (!line.hasChildNodes()) line.append(document.createElement("br"))

  return {element: block, languageLoaded: loadCodeLanguage(language)}

  function appendRun(text: string, classes: string[]) {
    for (const [index, part] of text.split("\n").entries()) {
      if (index) {
        if (!line.hasChildNodes()) line.append(document.createElement("br"))
        line = appendMarkdownCodeLine(scroller)
        offset++
      }
      if (!part) continue

      const parent = classes.length ? document.createElement("span") : line
      if (classes.length) {
        parent.className = classes.join(" ")
        line.append(parent)
      }
      appendHighlightedText(parent, part, intersectRanges(options.ranges, offset, part.length))
      offset += part.length
    }
  }

  function loadCodeLanguage(name: string): Promise<void> | null {
    if (!name || lowlight.registered(name)) return null

    const load = languageLoaders.get(name)
    if (!load) return null

    const existing = pending.get(name)
    if (existing) return existing

    const ready = load()
      .then(({default: grammar}) => lowlight.register(name, grammar))
      .catch(() => {
        languageLoaders.delete(name)
      })
      .finally(() => pending.delete(name))
    pending.set(name, ready)
    return ready
  }

  function languageName(token: Tokens.Code) {
    const aliases: Record<string, string> = {
      c: "cpp",
      cc: "cpp",
      "c++": "cpp",
      cxx: "cpp",
      h: "cpp",
      hpp: "cpp",
      cs: "csharp",
      "c#": "csharp",
      golang: "go",
      htm: "xml",
      html: "xml",
      js: "javascript",
      jsx: "javascript",
      jsonc: "json",
      md: "markdown",
      mysql: "sql",
      node: "javascript",
      nodejs: "javascript",
      postgres: "pgsql",
      postgresql: "pgsql",
      py: "python",
      python3: "python",
      rs: "rust",
      sh: "bash",
      sqlite: "sql",
      svg: "xml",
      ts: "typescript",
      tsx: "typescript",
      yml: "yaml",
    }
    const language = token.lang?.trim().split(WHITESPACE_REGEX, 1)[0]?.toLowerCase()
    return language && Object.hasOwn(aliases, language) ? aliases[language] : (language ?? "")
  }
}

function appendSyntaxNode(node: CodeNode, classes: string[], append: (text: string, classes: string[]) => void) {
  if (node.type === "text") append(node.value, classes)
  if (node.type === "element") {
    const own = node.properties.className
    const next = Array.isArray(own) ? [...classes, ...own.map(String)] : classes
    for (const child of node.children) appendSyntaxNode(child, next, append)
  }
}

function intersectRanges(ranges: readonly MarkdownOffsetRange[], offset: number, length: number) {
  const relative: MarkdownOffsetRange[] = []
  for (const [from, to] of ranges) {
    const start = Math.max(0, from - offset)
    const end = Math.min(length, to - offset)
    if (start < end) relative.push([start, end])
  }
  return relative
}
