import {
  LEADING_HORIZONTAL_WHITESPACE_REGEX,
  LEADING_SPACES_REGEX,
  MARKDOWN_BLOCKQUOTE_PREFIX_REGEX,
  MARKDOWN_CHECKBOX_PREFIX_REGEX,
  MARKDOWN_HEADING_PREFIX_REGEX,
  MARKDOWN_LEADING_BACKTICKS_REGEX,
  MARKDOWN_LINES_REGEX,
  MARKDOWN_LIST_MARKER_REGEX,
} from "@/constants/regex"
import {appendHighlightedText} from "./appendHighlightedText"

import type {SearchMatch} from "@daily/protocol"
import type {Token, Tokens} from "marked"
import type {MarkdownOffsetRange} from "./appendHighlightedText"

type SourceText = {text: string; start: number; positions?: readonly MarkdownOffsetRange[]}

const noHighlights = {
  appendText(parent: HTMLElement, _token: Token, renderedText: string) {
    if (renderedText) parent.append(renderedText)
  },
  rangesForCode(_token: Tokens.Code): MarkdownOffsetRange[] {
    return []
  },
}

export function createPreviewHighlights(source: string, tokens: readonly Token[], matches?: readonly SearchMatch[]) {
  if (!matches?.length) return noHighlights
  const matchesInSource = mergeRanges(matches.flatMap(({indices}) => indices.map(([from, to]): MarkdownOffsetRange => [from, to + 1])))
  if (!matchesInSource.length) return noHighlights
  const locations = new WeakMap<Token, SourceText>()
  mapTokens(tokens, normalizeSource(source), locations)

  return {
    appendText(parent: HTMLElement, token: Token, renderedText: string) {
      const raw = locations.get(token)
      const visible = raw && visibleSource(token, raw, renderedText)
      appendHighlightedText(parent, renderedText, visible ? visibleRanges(visible, matchesInSource) : [])
    },
    rangesForCode(token: Tokens.Code) {
      const raw = locations.get(token)
      const visible = raw && visibleSource(token, raw, token.text)
      return visible ? visibleRanges(visible, matchesInSource) : []
    },
  }
}

function mapTokens(tokens: readonly Token[], source: SourceText, locations: WeakMap<Token, SourceText>) {
  let cursor = 0
  for (const token of tokens) {
    if (!token.raw) continue
    const start = source.text.indexOf(token.raw, cursor)
    if (start < 0) continue

    cursor = start + token.raw.length
    const raw = sourceSlice(source, start, cursor)
    locations.set(token, raw)

    if (token.type === "list") {
      mapTokens((token as Tokens.List).items, raw, locations)
    } else if (token.type === "table") {
      mapTable(token as Tokens.Table, raw, locations)
    } else if ("tokens" in token && token.tokens?.length) {
      const inner = projectText(innerSource(token, raw), "text" in token ? String(token.text) : raw.text)
      if (!inner) continue
      const children = token.type === "list_item" ? token.tokens.filter((child) => child.type !== "checkbox") : token.tokens
      mapTokens(children, inner, locations)
    }
  }
}

function mapTable(table: Tokens.Table, raw: SourceText, locations: WeakMap<Token, SourceText>) {
  const lines = [...raw.text.matchAll(MARKDOWN_LINES_REGEX)]
  for (const [index, cells] of [table.header, ...table.rows].entries()) {
    const line = lines[index === 0 ? 0 : index + 1]
    if (!line) continue

    const source = sourceSlice(raw, line.index, line.index + line[0].length)
    const columnSources = splitTableRow(source)
    for (const [column, cell] of cells.entries()) {
      const slice = columnSources[column]
      const projected = slice && projectText(slice, cell.text)
      if (projected) mapTokens(cell.tokens, projected, locations)
    }
  }
}

function splitTableRow(row: SourceText) {
  const first = row.text.length - row.text.trimStart().length
  const slices: SourceText[] = []
  let start = row.text[first] === "|" ? first + 1 : first
  for (let index = start; index < row.text.length; index++) {
    if (row.text[index] === "\\") index++
    else if (row.text[index] === "|") {
      slices.push(sourceSlice(row, start, index))
      start = index + 1
    }
  }
  slices.push(sourceSlice(row, start))
  return slices
}

function innerSource(token: Token, source: SourceText) {
  if (token.type === "heading") return sourceSlice(source, source.text.match(MARKDOWN_HEADING_PREFIX_REGEX)?.[0].length ?? 0)
  if (token.type === "strong") return sourceSlice(source, 2, source.text.length - 2)
  if (token.type === "del") {
    const delimiter = source.text.startsWith("~~") ? 2 : 1
    return sourceSlice(source, delimiter, source.text.length - delimiter)
  }
  if (token.type === "list_item") {
    const marker = source.text.match(MARKDOWN_LIST_MARKER_REGEX)?.[0].length ?? 0
    const body = sourceSlice(source, marker)
    const checkbox = (token as Tokens.ListItem).task ? (body.text.match(MARKDOWN_CHECKBOX_PREFIX_REGEX)?.[0].length ?? 0) : 0
    return sourceSlice(body, checkbox)
  }
  if (token.type === "blockquote") return sourceSlice(source, source.text.match(MARKDOWN_BLOCKQUOTE_PREFIX_REGEX)?.[0].length ?? 0)
  if (token.type === "em") return sourceSlice(source, 1, source.text.length - 1)
  if (token.type === "link") {
    if (source.text.startsWith("<")) return sourceSlice(source, 1, source.text.length - 1)
    if (source.text.startsWith("[")) {
      const label = (token as Tokens.Link).text
      let end = 1
      for (let index = 0; index < label.length; index++) {
        const next = source.text[end + 1]
        if (source.text[end] === "\\" && (next === "[" || next === "]") && next === label[index]) end++
        if (source.text[end] !== label[index]) return sourceSlice(source, 1, 1)
        end++
      }
      return sourceSlice(source, 1, end)
    }
  }
  return source
}

function visibleSource(token: Token, raw: SourceText, text: string) {
  if (token.type === "escape") return projectText(sourceSlice(raw, 1), text)
  if (token.type === "codespan") {
    const fence = raw.text.match(MARKDOWN_LEADING_BACKTICKS_REGEX)?.[0].length ?? 0
    const body = sourceSlice(raw, fence, raw.text.length - fence)
    return projectText({...body, text: body.text.replaceAll("\n", " ")}, text)
  }
  if (token.type === "code" && text === token.text && (token as Tokens.Code).codeBlockStyle !== "indented") {
    return projectText(sourceSlice(raw, raw.text.indexOf("\n") + 1), text)
  }
  return projectText(raw, text)
}

function projectText(source: SourceText, text: string): SourceText | null {
  const exact = source.text.indexOf(text)
  if (exact >= 0) return sourceSlice(source, exact, exact + text.length)

  const positions: MarkdownOffsetRange[] = []
  let cursor = 0
  for (const [index, target] of text.split("\n").entries()) {
    if (index > 0) {
      const newline = source.text.indexOf("\n", cursor)
      if (newline < 0) return null
      positions.push(positionAt(source, newline))
      cursor = newline + 1
    }

    const newline = source.text.indexOf("\n", cursor)
    const limit = newline < 0 ? source.text.length : newline
    const start = source.text.indexOf(target, cursor)
    if (start >= 0 && start + target.length <= limit) {
      cursor = start
      for (let char = 0; char < target.length; char++) positions.push(positionAt(source, cursor++))
      continue
    }

    let char = 0
    const targetIndent = target.match(LEADING_SPACES_REGEX)?.[0].length ?? 0
    const sourceIndent = targetIndent ? (source.text.slice(cursor, limit).match(LEADING_HORIZONTAL_WHITESPACE_REGEX)?.[0] ?? null) : null
    if (sourceIndent && sourceIndent.includes("\t")) {
      const expanded: MarkdownOffsetRange[] = []
      for (let index = 0; index < sourceIndent.length; index++) {
        const width = sourceIndent[index] === "\t" ? 4 : 1
        for (let space = 0; space < width; space++) expanded.push(positionAt(source, cursor + index))
      }
      if (expanded.length >= targetIndent) {
        for (let index = expanded.length - targetIndent; index < expanded.length; index++) positions.push(expanded[index])
        cursor += sourceIndent.length
        char = targetIndent
      }
    }
    for (; char < target.length; char++) {
      const next = source.text.indexOf(target[char], cursor)
      if (next < 0 || next >= limit) return null
      positions.push(positionAt(source, next))
      cursor = next + 1
    }
  }
  return {text, start: source.start, positions}
}

function normalizeSource(source: string): SourceText {
  if (!source.includes("\r")) return {text: source, start: 0}

  let text = ""
  const positions: MarkdownOffsetRange[] = []
  for (let index = 0; index < source.length; index++) {
    const from = index
    if (source[index] === "\r") {
      text += "\n"
      if (source[index + 1] === "\n") index++
    } else text += source[index]
    positions.push([from, index + 1])
  }
  return {text, start: 0, positions}
}

function sourceSlice(source: SourceText, from: number, to = source.text.length): SourceText {
  return {text: source.text.slice(from, to), start: source.start + from, positions: source.positions?.slice(from, to)}
}

function positionAt(source: SourceText, offset: number): MarkdownOffsetRange {
  return source.positions?.[offset] ?? [source.start + offset, source.start + offset + 1]
}

function visibleRanges(visible: SourceText, matches: readonly MarkdownOffsetRange[]) {
  const ranges: MarkdownOffsetRange[] = []
  if (!visible.positions) {
    for (const [from, to] of matches) {
      const start = Math.max(from - visible.start, 0)
      const end = Math.min(to - visible.start, visible.text.length)
      if (start < end) ranges.push([start, end])
    }
    return ranges
  }

  let cursor = 0
  for (const [index, [from, to]] of visible.positions.entries()) {
    while (cursor < matches.length && matches[cursor][1] <= from) cursor++
    if (cursor >= matches.length || matches[cursor][0] >= to) continue
    const previous = ranges.at(-1)
    if (previous && previous[1] === index) previous[1] = index + 1
    else ranges.push([index, index + 1])
  }
  return ranges
}

function mergeRanges(ranges: MarkdownOffsetRange[]) {
  ranges.sort(([left], [right]) => left - right)
  const merged: MarkdownOffsetRange[] = []
  for (const [from, to] of ranges) {
    if (from >= to) continue
    const last = merged.at(-1)
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  return merged
}
