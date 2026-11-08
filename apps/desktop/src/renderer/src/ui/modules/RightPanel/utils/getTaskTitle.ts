import {
  MARKDOWN_ASTERISK_ITALIC_REGEX,
  MARKDOWN_BOLD_OR_STRIKE_REGEX,
  MARKDOWN_INLINE_CODE_REGEX,
  MARKDOWN_LINK_LABEL_REGEX,
  MARKDOWN_TASK_TITLE_PREFIX_REGEX,
  MARKDOWN_UNDERSCORE_EMPHASIS_REGEX,
} from "@/constants/regex"

/**
 * The first non-empty line of a task's markdown without its marks.
 *
 * @example
 * getTaskTitle("## **Ship** it\nmore") // "Ship it"
 */
export function getTaskTitle(content: string): string {
  const line = content.split("\n").find((value) => value.trim()) ?? ""
  return line
    .replace(MARKDOWN_TASK_TITLE_PREFIX_REGEX, "")
    .replace(MARKDOWN_LINK_LABEL_REGEX, "$1")
    .replace(MARKDOWN_INLINE_CODE_REGEX, "$2")
    .replace(MARKDOWN_BOLD_OR_STRIKE_REGEX, "$2")
    .replace(MARKDOWN_ASTERISK_ITALIC_REGEX, "$1")
    .replace(MARKDOWN_UNDERSCORE_EMPHASIS_REGEX, "$2")
    .trim()
}
