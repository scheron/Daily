import {shallowRef} from "vue"

import {Extension} from "@tiptap/core"
import {PluginKey} from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"

import type {IconName} from "@/ui/base/BaseIcon"
import type {QuickTaskMenu} from "@shared/types/quickTask"
import type {ChainedCommands, Editor, Range} from "@tiptap/core"
import type {SuggestionProps} from "@tiptap/suggestion"
import type {Ref} from "vue"
import type {NestedCommand} from "../types"

type SlashItem = {row: QuickTaskMenu["rows"][number]; apply: (editor: Editor, range: Range) => void}

export function useSlashMenu(commands: readonly NestedCommand[], linkDialogOpen: Ref<boolean>) {
  let suggestion: SuggestionProps<SlashItem, SlashItem> | null = null

  const menu = shallowRef<QuickTaskMenu | null>(null)

  const slashKey = new PluginKey("dailySlashMenu")
  const commandLabels = commands.map(({label}) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  const nested = commandLabels ? new RegExp(`(?:^|[\\s([{])(/(?:${commandLabels})\\s+[^\\n]*)$`, "i") : null
  const nestedQuery = commandLabels ? new RegExp(`^(${commandLabels})\\s+(.*)$`, "i") : null

  const extension = Extension.create({
    name: "dailySlashMenu",
    priority: 110,
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: slashKey,
          char: "/",
          allow: ({editor, state}) => {
            const {$from} = state.selection
            const marks = state.storedMarks ?? $from.marks()
            return editor.isEditable && !$from.parent.type.spec.code && !marks.some(({type}) => type.name === "code")
          },
          findSuggestionMatch: ({$position}) => {
            if (!$position.parent.isTextblock) return null

            const before = $position.parent.textBetween(0, $position.parentOffset, "\n", "\ufffc").replace(/^[\s\S]*[\n\ufffc]/, "")
            const text = nested?.exec(before)?.[1] ?? before.match(/(?:^|\s)(\/[\w-]*)$/)?.[1]
            if (!text) return null

            const to = $position.pos
            return {range: {from: to - text.length, to}, query: text.slice(1), text}
          },
          items: ({query}) => getItems(query),
          command: ({editor, range, props}) => props.apply(editor, range),
          render: () => ({
            onStart: (next) => update(next),
            onUpdate: (next) => update(next),
            onExit: () => clear(),
            onKeyDown: ({event}) => handleKeyDown(event),
          }),
        }),
      ]
    },
  })

  function pick(index: number) {
    if (!suggestion || !Number.isInteger(index)) return false
    const item = suggestion.items[index]
    if (!item) return false
    suggestion.command(item)
    return true
  }

  function dismiss(editor: Editor) {
    if (suggestion && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(slashKey, {exit: true}))
    clear()
  }

  function getItems(query: string): SlashItem[] {
    const match = nestedQuery?.exec(query)
    if (match) {
      const command = commands.find(({label}) => label.toLowerCase() === match[1].toLowerCase())
      if (!command || command.isAvailable?.() === false) return []

      return command.getItems(match[2].trim()).map(({apply, ...row}) => ({
        row: {...row, tone: command.tone},
        apply(editor, range) {
          editor.chain().focus().deleteRange(range).run()
          apply()
        },
      }))
    }

    type BlockCommand = [label: string, icon: IconName, command: (chain: ChainedCommands) => ChainedCommands]
    const headingLevels = [1, 2, 3, 4, 5, 6] as const
    const blockCommands: BlockCommand[] = [
      ["Divider", "minus", (chain) => chain.setHorizontalRule()],
      ...headingLevels.map((level): BlockCommand => [`Heading ${level}`, `heading-${level}`, (chain) => chain.toggleHeading({level})]),
      ["Bullet List", "layout-list", (chain) => chain.toggleBulletList()],
      ["Numbered List", "list-ordered", (chain) => chain.toggleOrderedList()],
      ["Checkbox", "checkbox", (chain) => chain.toggleTaskList()],
      ["Quote", "quote", (chain) => chain.toggleBlockquote()],
      ["Code Block", "code-block", (chain) => chain.toggleCodeBlock()],
      ["Table", "table", (chain) => chain.insertTable({rows: 3, cols: 3, withHeaderRow: true})],
    ]
    const blocks: SlashItem[] = blockCommands.map(([label, icon, command]) => ({
      row: {label, icon},
      apply: (editor, range) => command(editor.chain().focus().deleteRange(range)).run(),
    }))
    const taskItems: SlashItem[] = commands
      .filter((command) => command.isAvailable?.() !== false)
      .map(({label, icon}) => ({
        row: {label, icon},
        apply: (editor, range) => editor.chain().focus().insertContentAt(range, `/${label} `).run(),
      }))
    const link: SlashItem = {
      row: {label: "Link", icon: "link"},
      apply(editor, range) {
        editor.commands.deleteRange(range)
        linkDialogOpen.value = true
      },
    }
    return [blocks[0], ...taskItems, ...blocks.slice(1), link].filter(({row}) => row.label.toLowerCase().includes(query.toLowerCase()))
  }

  function update(next: SuggestionProps<SlashItem, SlashItem>) {
    const selected = suggestion?.query === next.query ? (menu.value?.selected ?? 0) : 0
    suggestion = next
    menu.value = next.items.length
      ? {rows: next.items.map(({row}) => row), selected: Math.min(selected, next.items.length - 1), caretX: getAnchor().left}
      : null
  }

  function getAnchor() {
    if (!suggestion || suggestion.editor.isDestroyed) return new DOMRect()

    try {
      const {left, right, top, bottom} = suggestion.editor.view.coordsAtPos(suggestion.range.to)
      return new DOMRect(left, top, right - left, bottom - top)
    } catch {
      return suggestion.clientRect?.() ?? new DOMRect()
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    const current = menu.value
    if (!current) return false

    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) return pick(current.selected)
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    const key = event.key.toLowerCase()
    const next = key === "arrowdown" || (ctrl && (key === "n" || key === "j"))
    const previous = key === "arrowup" || (ctrl && (key === "p" || key === "k"))
    if (!next && !previous) return false

    const count = current.rows.length
    menu.value = {...current, selected: (current.selected + (next ? 1 : count - 1)) % count}
    return true
  }

  function clear() {
    suggestion = null
    menu.value = null
  }

  return {extension, menu, getAnchor, pick, dismiss}
}
