import {formatMarkdownDestination} from "./formatMarkdownDestination"

export function formatMarkdownImage(url: string, alt: string, title?: string) {
  const label = alt.replace(/&/g, "&amp;").replace(/\\/g, "&#92;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;")
  return `![${label}](${formatMarkdownDestination(url, title)})`
}
