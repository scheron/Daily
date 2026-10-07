import {blockCommands, linkCommands} from "@/utils/codemirror/commands"
import {
  autocompletion,
  completionKeymap,
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  startCompletion,
} from "@codemirror/autocomplete"
import {syntaxTree} from "@codemirror/language"
import {EditorView, keymap} from "@codemirror/view"
import {getCompletionChipClass, getCompletionRowClass} from "./completionRow"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Completion, CompletionContext, CompletionResult} from "@codemirror/autocomplete"
import type {EditorState, Extension} from "@codemirror/state"
import type {SyntaxNode} from "@lezer/common"
import type {QuickTaskMenu} from "@shared/types/quickTask"

type SlashItem = {label: string; icon: IconName; run: (view: EditorView) => boolean}

/** One choice in a command's second-level list. A `color` renders it as a tag chip, otherwise it needs an `icon` for a plain row, which `iconColor` can tint. */
export type NestedItem = {label: string; icon?: IconName; iconColor?: string; color?: string; apply: () => void}

/** A `/` command that opens a second-level list. `getItems` receives what was typed after the command and does its own filtering. */
export type NestedCommand = {
  label: string
  icon: IconName
  tone?: "remove"
  isAvailable?: () => boolean
  getItems: (query: string) => NestedItem[]
}

export type SlashCommandsOptions = {commands: NestedCommand[]}

type OptionMeta = {icon?: IconName; iconColor?: string; color?: string; tone?: "remove"}

const SLASH_ITEMS: SlashItem[] = [
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

/** Without `options` — a project or milestone description has nothing to set — `/` still offers every block command, only without the task commands. */
export function createCompletionExtension(options?: SlashCommandsOptions, onMenuChange?: (menu: QuickTaskMenu | null) => void): Extension {
  const metaByCompletion = new WeakMap<Completion, OptionMeta>()

  return [
    onMenuChange ? createExternalMenuExtension(metaByCompletion, onMenuChange) : [],
    autocompletion({
      activateOnTyping: true,
      icons: false,
      tooltipClass: () => "cm-tags-autocomplete",
      optionClass: (completion) => getCompletionRowClass(metaByCompletion.get(completion) ?? {}),
      addToOptions: [
        {
          position: 45,
          render: (completion) => {
            const meta = metaByCompletion.get(completion)
            if (!meta) return null

            const chipClass = getCompletionChipClass(meta)
            if (chipClass && meta.color) {
              const chip = document.createElement("span")
              chip.className = chipClass
              chip.style.setProperty("--tag-color", meta.color)
              chip.textContent = completion.label
              return chip
            }

            if (!meta.icon) return null

            const row = document.createElement("span")
            row.className = "cm-slash-option-row"
            const iconEl = document.createElement("span")
            iconEl.className = "cm-slash-option-icon"
            if (meta.iconColor) iconEl.style.color = meta.iconColor
            iconEl.innerHTML = `<svg width="16" height="16" aria-hidden="true"><use href="#${meta.icon}" /></svg>`
            const labelEl = document.createElement("span")
            labelEl.className = "cm-slash-option-label"
            labelEl.textContent = completion.label.replace(/^\//, "")
            row.append(iconEl, labelEl)
            return row
          },
        },
      ],
      override: options
        ? [createNestedCompletionSource(options.commands, metaByCompletion), createSlashCompletionSource(metaByCompletion, options.commands)]
        : [createSlashCompletionSource(metaByCompletion)],
    }),
    keymap.of(completionKeymap),
  ]
}

function createExternalMenuExtension(metaByCompletion: WeakMap<Completion, OptionMeta>, onChange: (menu: QuickTaskMenu | null) => void): Extension {
  let wasOpen = false

  return [
    EditorView.theme({".cm-tooltip.cm-tooltip-autocomplete": {display: "none !important"}}),
    EditorView.updateListener.of((update) => {
      const status = completionStatus(update.state)
      if (status === "pending") return

      const isOpen = status === "active"
      if (!isOpen && !wasOpen) return
      wasOpen = isOpen

      update.view.requestMeasure({
        read: (view) => (isOpen ? toMenu(view, metaByCompletion) : null),
        write: (menu) => onChange(menu),
      })
    }),
  ]
}

function toMenu(view: EditorView, metaByCompletion: WeakMap<Completion, OptionMeta>): QuickTaskMenu | null {
  const state: EditorState = view.state
  if (completionStatus(state) !== "active") return null

  const rows = currentCompletions(state).map((completion) => {
    const meta = metaByCompletion.get(completion)
    return {
      label: meta?.color ? completion.label : completion.label.replace(/^\//, ""),
      icon: meta?.icon,
      iconColor: meta?.iconColor,
      color: meta?.color,
      tone: meta?.tone,
    }
  })

  return {rows, selected: selectedCompletionIndex(state) ?? 0, caretX: view.coordsAtPos(state.selection.main.head)?.left ?? 0}
}

function insertNestedCommand(command: NestedCommand): (view: EditorView) => boolean {
  return (view) => {
    const {from, to} = view.state.selection.main
    const text = `/${command.label} `

    view.dispatch({changes: {from, to, insert: text}, selection: {anchor: from + text.length}})
    setTimeout(() => startCompletion(view), 0)
    return true
  }
}

function createNestedCompletionSource(
  commands: NestedCommand[],
  metaByCompletion: WeakMap<Completion, OptionMeta>,
): (context: CompletionContext) => CompletionResult | null {
  const names = commands.map((command) => escapeRegExp(command.label)).join("|")
  const pattern = new RegExp(`(^|[\\s([{])\\/(${names})\\s+(.*)$`, "i")

  return (context) => {
    const line = context.state.doc.lineAt(context.pos)
    const textBeforeCursor = context.state.sliceDoc(line.from, context.pos)
    const match = textBeforeCursor.match(pattern)
    if (!match) return null

    const command = commands.find((c) => c.label.toLowerCase() === match[2].toLowerCase())
    if (!command || (command.isAvailable && !command.isAvailable())) return null

    const query = match[3] ?? ""
    const commandFrom = line.from + (match.index ?? 0) + match[1].length

    const completions = command.getItems(query.trim()).map((item): Completion => {
      const completion: Completion = {
        label: item.label,
        type: "keyword",
        apply: (view, _completion, _from, to) => {
          view.dispatch({changes: {from: commandFrom, to, insert: ""}, selection: {anchor: commandFrom}})
          item.apply()
          view.focus()
        },
      }
      metaByCompletion.set(completion, {icon: item.icon, iconColor: item.iconColor, color: item.color, tone: command.tone})
      return completion
    })

    if (!completions.length) return null

    return {from: context.pos - query.length, to: context.pos, options: completions, filter: false}
  }
}

function createSlashCompletionSource(
  metaByCompletion: WeakMap<Completion, OptionMeta>,
  commands: NestedCommand[] = [],
): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    const match = context.matchBefore(/\/[\w-]*/)
    if (!match) return null
    if (!context.explicit && match.from === match.to) return null

    const charBefore = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : "\n"
    if (charBefore !== "\n" && !/\s/.test(charBefore)) return null

    if (isInsideCode(context)) return null

    const commandItems: SlashItem[] = commands
      .filter((command) => !command.isAvailable || command.isAvailable())
      .map((command) => ({label: command.label, icon: command.icon, run: insertNestedCommand(command)}))
    const items = [...SLASH_ITEMS.slice(0, 1), ...commandItems, ...SLASH_ITEMS.slice(1)]

    return {
      from: match.from,
      to: match.to,
      options: items.map((item, index) => toCompletion(item, index, metaByCompletion)),
      validFor: /^\/[\w-]*$/,
    }
  }
}

function toCompletion(item: SlashItem, index: number, metaByCompletion: WeakMap<Completion, OptionMeta>): Completion {
  const completion: Completion = {
    label: `/${item.label}`,
    type: "keyword",
    sortText: String(index).padStart(2, "0"),
    apply: (view, _completion, from, to) => {
      view.dispatch({changes: {from, to, insert: ""}, selection: {anchor: from}})
      item.run(view)
      view.focus()
    },
  }
  metaByCompletion.set(completion, {icon: item.icon})
  return completion
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isInsideCode(context: CompletionContext): boolean {
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(context.pos, -1)
  while (node) {
    if (node.name === "FencedCode" || node.name === "InlineCode" || node.name === "CodeText") return true
    node = node.parent
  }
  return false
}
