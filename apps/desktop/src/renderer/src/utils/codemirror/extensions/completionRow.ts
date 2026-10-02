type CompletionRowKind = "tag-add" | "tag-remove" | "slash"

type CompletionRowSource = {color?: string; tone?: "remove"}

const ROW_CLASS: Record<CompletionRowKind, string> = {
  "tag-add": "cm-tag-option cm-tag-option-add",
  "tag-remove": "cm-tag-option cm-tag-option-remove",
  slash: "cm-slash-option",
}

const CHIP_CLASS: Record<"tag-add" | "tag-remove", string> = {
  "tag-add": "cm-tag-option-chip cm-tag-option-chip-add",
  "tag-remove": "cm-tag-option-chip cm-tag-option-chip-remove",
}

/** Whether a `/` menu row is a tag chip to add, a tag chip to remove, or a plain command row. */
export function getCompletionRowKind(row: CompletionRowSource): CompletionRowKind {
  if (!row.color) return "slash"
  return row.tone === "remove" ? "tag-remove" : "tag-add"
}

/** The classes of a `/` menu row's `li`, shared by the editor's own menu and the Quick Capture menu window. */
export function getCompletionRowClass(row: CompletionRowSource): string {
  return ROW_CLASS[getCompletionRowKind(row)]
}

/** The classes of the tag chip inside a tag row, or `null` for a row that has no chip. */
export function getCompletionChipClass(row: CompletionRowSource): string | null {
  const kind = getCompletionRowKind(row)
  return kind === "slash" ? null : CHIP_CLASS[kind]
}
