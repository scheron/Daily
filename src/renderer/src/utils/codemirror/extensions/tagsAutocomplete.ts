import {autocompletion, completionKeymap} from "@codemirror/autocomplete"
import {EditorView, keymap} from "@codemirror/view"

import type {Completion, CompletionContext, CompletionResult} from "@codemirror/autocomplete"
import type {Extension} from "@codemirror/state"
import type {Tag} from "@shared/types/storage"

type TagsAutocompleteOptions = {
  getTags: () => Tag[]
  getAttachedTags?: () => Tag[]
  onAddTag?: (tag: Tag) => void
  onRemoveTag?: (tag: Tag) => void
}

function getTagByNameMap(tags: Tag[]): Map<string, Tag> {
  return new Map(tags.map((tag) => [tag.name.toLowerCase(), tag]))
}

function createTagCompletions(
  tags: Tag[],
  query: string,
  mode: "add" | "remove",
  metaByLabel: Map<string, {color: string; mode: "add" | "remove"}>,
  onApply?: (tag: Tag) => void,
): Completion[] {
  const normalizedQuery = query.toLowerCase()
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name))

  return sorted
    .filter((tag) => {
      const name = tag.name.toLowerCase()
      return !normalizedQuery || name.includes(normalizedQuery)
    })
    .map((tag) => {
      const label = `${mode === "remove" ? "-#" : "#"}${tag.name}`
      metaByLabel.set(label, {color: tag.color, mode})

      return {
        label,
        type: "keyword",
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          view.dispatch({
            changes: {from, to, insert: ""},
            selection: {anchor: from},
          })
          onApply?.(tag)
        },
      } satisfies Completion
    })
}

function findTrailingCommand(textBeforeCursor: string) {
  const match = textBeforeCursor.match(/(?:^|[\s([{])(-?#([\w-]+))$/)
  if (!match) return null

  const command = match[1]
  const name = match[2]
  const mode = command.startsWith("-#") ? "remove" : "add"
  const from = textBeforeCursor.length - command.length

  return {mode, name, from}
}

function createCommandApplyExtension(options: TagsAutocompleteOptions): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (![" ", "\n", "\t"].includes(text)) return false

    const line = view.state.doc.lineAt(from)
    const lineTextBeforeCursor = view.state.doc.sliceString(line.from, from)
    const command = findTrailingCommand(lineTextBeforeCursor)

    if (!command) return false

    const availableTags = command.mode === "remove" ? (options.getAttachedTags?.() ?? options.getTags()) : options.getTags()
    const tag = getTagByNameMap(availableTags).get(command.name.toLowerCase())
    if (!tag) return false

    if (command.mode === "remove") options.onRemoveTag?.(tag)
    else options.onAddTag?.(tag)

    const commandFrom = line.from + command.from
    const prevChar = commandFrom > 0 ? view.state.doc.sliceString(commandFrom - 1, commandFrom) : ""
    const insert = text === " " && /\s/.test(prevChar) ? "" : text

    view.dispatch({
      changes: {from: commandFrom, to, insert},
      selection: {anchor: commandFrom + insert.length},
    })

    return true
  })
}

export function createTagsAutocompleteExtension(options: TagsAutocompleteOptions): Extension {
  const metaByLabel = new Map<string, {color: string; mode: "add" | "remove"}>()

  const source = (context: CompletionContext): CompletionResult | null => {
    // Strict trigger: only #tag or -#tag, never plain "#" or "# ".
    const match = context.matchBefore(/-?#[\w-]+/)
    console.log("[1] match", match?.text)
    if (!match) return null

    console.log("[2] explicit/empty", context.explicit, match.from === match.to)
    if (!context.explicit && match.from === match.to) return null

    const charBeforeHash = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : ""
    console.log("[3] charBeforeHash", JSON.stringify(charBeforeHash))
    if (charBeforeHash && /[\w-]/.test(charBeforeHash)) return null
    const isRemove = match.text.startsWith("-#")
    const query = match.text.slice(isRemove ? 2 : 1)
    console.log("[4] query", query)

    metaByLabel.clear()
    const sourceTags = isRemove ? (options.getAttachedTags?.() ?? options.getTags()) : options.getTags()
    const completions = createTagCompletions(
      sourceTags,
      query,
      isRemove ? "remove" : "add",
      metaByLabel,
      isRemove ? options.onRemoveTag : options.onAddTag,
    )
    console.log("[5] completions", completions.length)
    if (!completions.length) return null

    const result = {
      from: match.from,
      to: match.to,
      options: completions,
      validFor: /-?#[\w-]*/,
    }
    console.log("[6] result", result)
    return result
  }

  return [
    autocompletion({
      activateOnTyping: true,
      icons: false,
      tooltipClass: () => "cm-tags-autocomplete",
      optionClass: (completion) => {
        const mode = metaByLabel.get(completion.label)?.mode
        if (mode === "remove") return "cm-tag-option cm-tag-option-remove"
        return "cm-tag-option cm-tag-option-add"
      },
      addToOptions: [
        {
          position: 45,
          render: (completion) => {
            const meta = metaByLabel.get(completion.label)
            if (!meta) return null

            const chip = document.createElement("span")
            chip.className = `cm-tag-option-chip ${meta.mode === "remove" ? "cm-tag-option-chip-remove" : "cm-tag-option-chip-add"}`
            chip.style.setProperty("--tag-color", meta.color)
            chip.textContent = completion.label.replace(/^-?#/, "")
            return chip
          },
        },
      ],
      override: [source],
    }),
    createCommandApplyExtension(options),
    keymap.of(completionKeymap),
  ]
}
