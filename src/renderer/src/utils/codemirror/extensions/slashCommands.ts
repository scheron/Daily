import {blockCommands, linkCommands} from "@/utils/codemirror/commands"

import {syntaxTree} from "@codemirror/language"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Completion, CompletionContext, CompletionResult} from "@codemirror/autocomplete"
import type {EditorView} from "@codemirror/view"

type SlashItem = {label: string; icon: IconName; run: (view: EditorView) => boolean}

const ITEMS: SlashItem[] = [
  {label: "Divider", icon: "minus", run: blockCommands.insertHorizontalRule},
  {label: "Heading 1", icon: "heading-1", run: blockCommands.insertHeading1},
  {label: "Heading 2", icon: "heading-2", run: blockCommands.insertHeading2},
  {label: "Heading 3", icon: "heading-3", run: blockCommands.insertHeading3},
  {label: "Heading 4", icon: "heading-4", run: blockCommands.insertHeading4},
  {label: "Heading 5", icon: "heading-5", run: blockCommands.insertHeading5},
  {label: "Heading 6", icon: "heading-6", run: blockCommands.insertHeading6},
  {label: "Bullet List", icon: "layout-list", run: blockCommands.insertBulletList},
  {label: "Numbered List", icon: "list-ordered", run: blockCommands.insertNumberedList},
  {label: "Checkbox", icon: "checkbox", run: blockCommands.insertCheckbox},
  {label: "Quote", icon: "quote", run: blockCommands.insertBlockquote},
  {label: "Code Block", icon: "code-block", run: blockCommands.insertCodeBlock},
  {label: "Table", icon: "table", run: blockCommands.insertTable},
  {label: "Link", icon: "link", run: linkCommands.insertLink},
]

/**
 * Sprite icon name for each slash option, keyed by its completion label (the
 * display name prefixed with `/`, e.g. `"/Heading 1"`).
 */
export const slashIconByLabel = new Map<string, IconName>(ITEMS.map((item) => [`/${item.label}`, item.icon]))

/**
 * Completion source for the `/` insert menu. Triggers on `/` at the start of a
 * line or after whitespace (never inside code), offering block-insert commands.
 * Option labels are `/`-prefixed so CodeMirror's matcher filters them against
 * the typed `/query`; selecting one removes the `/query` and runs the command.
 */
export function slashCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\/[\w-]*/)
  if (!match) return null
  if (!context.explicit && match.from === match.to) return null

  const charBefore = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : "\n"
  if (charBefore !== "\n" && !/\s/.test(charBefore)) return null

  if (isInsideCode(context)) return null

  return {from: match.from, to: match.to, options: ITEMS.map(toCompletion), validFor: /^\/[\w-]*$/}
}

function toCompletion(item: SlashItem, index: number): Completion {
  return {
    label: `/${item.label}`,
    type: "keyword",
    // Keep the menu in our defined order (CodeMirror sorts by sortText||label,
    // which would otherwise scatter related items alphabetically).
    sortText: String(index).padStart(2, "0"),
    apply: (view, _completion, from, to) => {
      view.dispatch({changes: {from, to, insert: ""}, selection: {anchor: from}})
      item.run(view)
      view.focus()
    },
  }
}

function isInsideCode(context: CompletionContext): boolean {
  let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(context.state).resolveInner(context.pos, -1)
  while (node) {
    if (node.name === "FencedCode" || node.name === "InlineCode" || node.name === "CodeText") return true
    node = node.parent
  }
  return false
}
