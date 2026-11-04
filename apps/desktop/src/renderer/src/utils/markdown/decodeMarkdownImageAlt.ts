import {decodeHtmlEntities} from "@tiptap/core"

export function decodeMarkdownImageAlt(alt: string) {
  return decodeHtmlEntities(alt.replace(/\\\\/g, "\\"))
}
