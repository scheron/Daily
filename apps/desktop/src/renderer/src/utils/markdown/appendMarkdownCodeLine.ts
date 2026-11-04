export function appendMarkdownCodeLine(parent: HTMLElement) {
  const line = document.createElement("div")
  line.className = "markdown-code-line"
  parent.append(line)
  return line
}
