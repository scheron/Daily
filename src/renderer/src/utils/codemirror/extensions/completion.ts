import {sort} from "fast-sort"

import {slashIconByLabel as baseSlashIconByLabel, createSlashCompletionSource} from "@/utils/codemirror/extensions/slashCommands"

import {autocompletion, completionKeymap, startCompletion} from "@codemirror/autocomplete"
import {keymap} from "@codemirror/view"

import type {SlashItem} from "@/utils/codemirror/extensions/slashCommands"
import type {Completion, CompletionContext, CompletionResult} from "@codemirror/autocomplete"
import type {Extension} from "@codemirror/state"
import type {EditorView} from "@codemirror/view"
import type {Tag} from "@shared/types/storage"

type TagsAutocompleteOptions = {
  getTags: () => Tag[]
  getAttachedTags?: () => Tag[]
  onAddTag?: (tag: Tag) => void
  onRemoveTag?: (tag: Tag) => void
}

type TagCommandMode = "add" | "remove"

function createTagCompletions(
  tags: Tag[],
  query: string,
  mode: TagCommandMode,
  commandFrom: number,
  metaByLabel: Map<string, {color: string; mode: TagCommandMode}>,
  onApply?: (tag: Tag) => void,
): Completion[] {
  const normalizedQuery = query.toLowerCase()
  const sorted = sort(tags).asc((t) => t.name)

  return sorted
    .filter((tag) => {
      const name = tag.name.toLowerCase()
      return !normalizedQuery || name.includes(normalizedQuery)
    })
    .map((tag) => {
      const label = tag.name
      metaByLabel.set(label, {color: tag.color, mode})

      return {
        label,
        type: "keyword",
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          view.dispatch({
            changes: {from: commandFrom, to, insert: ""},
            selection: {anchor: commandFrom},
          })
          onApply?.(tag)
          view.focus()
        },
      } satisfies Completion
    })
}

export function createTagSlashItems(showRemove = true): SlashItem[] {
  const addItem: SlashItem = {label: "Add Tag", icon: "tags", run: insertTagCommand("add")}
  const removeItem: SlashItem = {label: "Remove Tag", icon: "tags-off", run: insertTagCommand("remove")}

  return showRemove ? [addItem, removeItem] : [addItem]
}

function insertTagCommand(mode: TagCommandMode): (view: EditorView) => boolean {
  return (view) => {
    const {from, to} = view.state.selection.main
    const label = mode === "remove" ? "Remove Tag" : "Add Tag"
    const command = `/${label} `

    view.dispatch({changes: {from, to, insert: command}, selection: {anchor: from + command.length}})
    setTimeout(() => startCompletion(view), 0)
    return true
  }
}

export function createTagSlashCompletionSource(
  options: TagsAutocompleteOptions,
  metaByLabel: Map<string, {color: string; mode: TagCommandMode}> = new Map(),
): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    const line = context.state.doc.lineAt(context.pos)
    const textBeforeCursor = context.state.sliceDoc(line.from, context.pos)
    const match = textBeforeCursor.match(/(^|[\s([{])\/(Add Tag|Remove Tag)\s+([\w-]*)$/i)

    if (!match) return null
    if (context.pos < line.from) return null

    const mode = match[2].toLowerCase() === "remove tag" ? "remove" : "add"
    const query = match[3] ?? ""
    const commandFrom = line.from + (match.index ?? 0) + match[1].length
    const queryFrom = context.pos - query.length
    const sourceTags = mode === "remove" ? (options.getAttachedTags?.() ?? options.getTags()) : options.getTags()

    metaByLabel.clear()
    const completions = createTagCompletions(
      sourceTags,
      query,
      mode,
      commandFrom,
      metaByLabel,
      mode === "remove" ? options.onRemoveTag : options.onAddTag,
    )

    if (!completions.length) return null

    return {
      from: queryFrom,
      to: context.pos,
      options: completions,
      validFor: /^[\w-]*$/,
    }
  }
}

export function createCompletionExtension(options: TagsAutocompleteOptions): Extension {
  const tagMetaByLabel = new Map<string, {color: string; mode: TagCommandMode}>()
  const tagSlashItems = createTagSlashItems()
  const slashIconByLabel = new Map(baseSlashIconByLabel)

  tagSlashItems.forEach((item) => slashIconByLabel.set(`/${item.label}`, item.icon))

  return [
    autocompletion({
      activateOnTyping: true,
      icons: false,
      tooltipClass: () => "cm-tags-autocomplete",
      optionClass: (completion) => {
        const meta = tagMetaByLabel.get(completion.label)
        if (meta) return meta.mode === "remove" ? "cm-tag-option cm-tag-option-remove" : "cm-tag-option cm-tag-option-add"
        return "cm-slash-option"
      },
      addToOptions: [
        {
          position: 45,
          render: (completion) => {
            const meta = tagMetaByLabel.get(completion.label)
            if (meta) {
              const chip = document.createElement("span")
              chip.className = `cm-tag-option-chip ${meta.mode === "remove" ? "cm-tag-option-chip-remove" : "cm-tag-option-chip-add"}`
              chip.style.setProperty("--tag-color", meta.color)
              chip.textContent = completion.label
              return chip
            }

            const icon = slashIconByLabel.get(completion.label)
            if (icon === undefined) return null

            const row = document.createElement("span")
            row.className = "cm-slash-option-row"
            const iconEl = document.createElement("span")
            iconEl.className = "cm-slash-option-icon"
            iconEl.innerHTML = `<svg width="16" height="16" aria-hidden="true"><use href="#${icon}" /></svg>`
            const labelEl = document.createElement("span")
            labelEl.className = "cm-slash-option-label"
            labelEl.textContent = completion.label.replace(/^\//, "")
            row.append(iconEl, labelEl)
            return row
          },
        },
      ],
      override: [
        createTagSlashCompletionSource(options, tagMetaByLabel),
        createSlashCompletionSource(() => createTagSlashItems(Boolean(options.getAttachedTags?.().length))),
      ],
    }),
    keymap.of(completionKeymap),
  ]
}
