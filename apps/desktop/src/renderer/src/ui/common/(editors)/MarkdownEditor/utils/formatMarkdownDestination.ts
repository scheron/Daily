import {MARKDOWN_DESTINATION_BRACKETS_REGEX, MARKDOWN_DESTINATION_ESCAPE_REGEX, MARKDOWN_LINK_TITLE_ESCAPE_REGEX} from "@/constants/regex"

export function formatMarkdownDestination(url: string, title?: string) {
  const escapedUrl = url.replace(MARKDOWN_DESTINATION_ESCAPE_REGEX, "\\$&")
  const destination = MARKDOWN_DESTINATION_BRACKETS_REGEX.test(url) ? `<${escapedUrl}>` : escapedUrl
  const escapedTitle = title?.replace(MARKDOWN_LINK_TITLE_ESCAPE_REGEX, "\\$&")

  return escapedTitle ? `${destination} "${escapedTitle}"` : destination
}
