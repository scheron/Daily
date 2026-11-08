import {AMPERSAND_REGEX, BACKSLASH_REGEX, LEFT_BRACKET_REGEX, RIGHT_BRACKET_REGEX} from "@/constants/regex"
import {formatMarkdownDestination} from "./formatMarkdownDestination"

export function formatMarkdownImage(url: string, alt: string, title?: string) {
  const label = alt
    .replace(AMPERSAND_REGEX, "&amp;")
    .replace(BACKSLASH_REGEX, "&#92;")
    .replace(LEFT_BRACKET_REGEX, "&#91;")
    .replace(RIGHT_BRACKET_REGEX, "&#93;")
  return `![${label}](${formatMarkdownDestination(url, title)})`
}
