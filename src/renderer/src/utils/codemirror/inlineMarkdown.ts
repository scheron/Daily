const INLINE_RE = new RegExp(
  [
    "(`[^`]+`)", // 1: inline code
    "(\\*\\*[\\s\\S]+?\\*\\*)", // 2: bold (**)
    "((?<![\\w])__[\\s\\S]+?__(?![\\w]))", // 3: bold (__)
    "(\\*[\\s\\S]+?\\*)", // 4: italic (*)
    "((?<![\\w])_[\\s\\S]+?_(?![\\w]))", // 5: italic (_)
    "(~~[\\s\\S]+?~~)", // 6: strikethrough
    "(\\[[^\\]]+\\]\\([^)]+\\))", // 7: link
  ].join("|"),
)

/**
 * Render a single line of inline markdown to DOM nodes, reusing the editor's
 * `cm-*` classes so it matches the live editor's look. Handles bold, italic,
 * inline code, strikethrough, and links; everything else is plain text. Builds
 * real nodes (no `innerHTML`), so cell content can't inject markup.
 *
 * @param text - One line of inline markdown (e.g. a table cell)
 * @example renderInlineMarkdown("a **b** `c`") // → [text, <strong>, text, <span.cm-code>]
 */
export function renderInlineMarkdown(text: string): Node[] {
  const nodes: Node[] = []
  let rest = text

  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest)
    if (!match) {
      nodes.push(document.createTextNode(rest))
      break
    }

    if (match.index > 0) nodes.push(document.createTextNode(rest.slice(0, match.index)))

    const token = match[0]
    if (match[1]) {
      nodes.push(styledSpan("cm-code", [document.createTextNode(token.slice(1, -1))]))
    } else if (match[2] || match[3]) {
      nodes.push(wrap("strong", "cm-strong", token.slice(2, -2)))
    } else if (match[4] || match[5]) {
      nodes.push(wrap("em", "cm-emphasis", token.slice(1, -1)))
    } else if (match[6]) {
      const strike = wrap("span", "", token.slice(2, -2))
      strike.style.textDecoration = "line-through"
      nodes.push(strike)
    } else if (match[7]) {
      const link = token.match(/\[([^\]]+)\]\([^)]+\)/)
      nodes.push(styledSpan("cm-link", [document.createTextNode(link ? link[1] : token)]))
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
