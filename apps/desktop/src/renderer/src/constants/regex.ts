export const ALLOWED_LINK_URL_REGEX = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+)$/i
export const AMPERSAND_REGEX = /&/g
export const BACKSLASH_REGEX = /\\/g
export const DAY_MONTH_REGEX = /^(\d{1,2})\.(\d{1,2})$/
export const DURATION_HOURS_MINUTES_REGEX = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i
export const ERROR_NAME_PREFIX_REGEX = /^[A-Za-z]*Error:\s*/
export const ESCAPED_BACKSLASH_REGEX = /\\\\/g
export const FILE_EXTENSION_REGEX = /\.[^./\\]+$/
export const IPC_ERROR_PREFIX_REGEX = /^Error invoking remote method '[^']+':\s*/
export const LEADING_HORIZONTAL_WHITESPACE_REGEX = /^[ \t]+/
export const LEADING_SPACES_REGEX = /^ +/
export const LEFT_BRACKET_REGEX = /\[/g
export const LINE_BREAK_REGEX = /\r?\n/g
export const MARKDOWN_ASTERISK_ITALIC_REGEX = /\*(?=\S)(.+?)(?<=\S)\*/g
export const MARKDOWN_BACKTICK_RUNS_REGEX = /^ {0,3}(`+)/gm
export const MARKDOWN_BLOCKQUOTE_PREFIX_REGEX = /^ {0,3}>[ \t]?/
export const MARKDOWN_BOLD_OR_STRIKE_REGEX = /(\*\*|~~)(?=\S)(.+?)(?<=\S)\1/g
export const MARKDOWN_CHECKBOX_PREFIX_REGEX = /^\[[ xX]\][ \t]*/
export const MARKDOWN_DESTINATION_BRACKETS_REGEX = /[\s()<>]/
export const MARKDOWN_DESTINATION_ESCAPE_REGEX = /[\\<>]/g
export const MARKDOWN_FENCE_OPENER_REGEX = /^[ \t]{0,3}(\x60{3,}|~{3,})/
export const MARKDOWN_HEADING_PREFIX_REGEX = /^ {0,3}#{1,6}[ \t]+/
export const MARKDOWN_IMAGE_DIMENSIONS_REGEX = /\s*=(\d+)x(\d+)$/
export const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\([^)]+\)/g
export const MARKDOWN_INLINE_CODE_REGEX = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g
export const MARKDOWN_INLINE_LINK_REGEX = /^\[[\s\S]*\]\([\s\S]*\)$/
export const MARKDOWN_LEADING_BACKTICKS_REGEX = /^`+/
export const MARKDOWN_LINES_REGEX = /^[^\n]*/gm
export const MARKDOWN_LINK_LABEL_REGEX = /!?\[([^\]]*)\]\([^)]*\)/g
export const MARKDOWN_LINK_TITLE_ESCAPE_REGEX = /[\\"]/g
export const MARKDOWN_LIST_MARKER_REGEX = /^ {0,3}(?:[*+-]|\d{1,9}[.)])[ \t]*/
export const MARKDOWN_PARAGRAPH_BLOCK_MARKER_REGEX = /^([ \t]{0,3})(#{1,6}|[+-])(?=[ \t]|$)/gm
export const MARKDOWN_PARAGRAPH_ORDERED_MARKER_REGEX = /^([ \t]{0,3}\d{1,9})([.)])(?=[ \t]|$)/gm
export const MARKDOWN_PARAGRAPH_RULE_OR_SETEXT_REGEX = /^([ \t]{0,3})(={1,}|-{3,})(?=[ \t]*$)/gm
export const MARKDOWN_QUOTE_OR_UNDERSCORE_REGEX = /['"_]/
export const MARKDOWN_TABLE_CELL_ESCAPE_REGEX = /\\.|\|/g
export const MARKDOWN_TASK_TITLE_PREFIX_REGEX = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/
export const MARKDOWN_TILDE_RUNS_REGEX = /^ {0,3}(~+)/gm
export const MARKDOWN_TYPED_CODE_FENCE_REGEX = /(^|\n)[ \t]*(?:`{3,}|~{3,})([A-Za-z][\w+#.-]*)?[ \t]*$/
export const MARKDOWN_UNDERSCORE_EMPHASIS_REGEX = /(?<!\w)(__?)(?=\S)(.+?)(?<=\S)\1(?!\w)/g
export const MARKDOWN_UNFINISHED_UNDERSCORE_ITALIC_REGEX = /(?:^|[^\w_])_([^_\n]+)$/
export const NON_DIGIT_REGEX = /\D/g
export const REGEXP_METACHARACTER_REGEX = /[.*+?^${}()|[\]\\]/g
export const RELEASE_IMAGE_EXTENSION_REGEX = /\.(?:avif|jpe?g|png|webp)$/i
export const RIGHT_BRACKET_REGEX = /\]/g
export const SCROLLABLE_OVERFLOW_REGEX = /(auto|scroll|overlay)/
export const THROUGH_LAST_TEXTBLOCK_BREAK_REGEX = /^[\s\S]*[\n\ufffc]/
export const TRAILING_LETTER_OR_NUMBER_REGEX = /[\p{L}\p{N}]$/u
export const TRAILING_NEWLINES_REGEX = /\n+$/
export const TRAILING_SLASH_COMMAND_REGEX = /(?:^|\s)(\/[\w-]*)$/
export const URL_SCHEME_REGEX = /^[a-z][\w+.-]*:/i
export const WHITESPACE_REGEX = /\s/
export const WORD_CHARACTER_REGEX = /[\w]/u
