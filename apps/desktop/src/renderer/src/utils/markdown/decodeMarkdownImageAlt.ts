import {ESCAPED_BACKSLASH_REGEX} from "@/constants/regex"
import {decodeHtmlEntities} from "@tiptap/core"

export function decodeMarkdownImageAlt(alt: string) {
  return decodeHtmlEntities(alt.replace(ESCAPED_BACKSLASH_REGEX, "\\"))
}
