import {sort} from "fast-sort"

import {blockCommands, linkCommands} from "@/utils/codemirror/commands"
import {autocompletion, completionKeymap, startCompletion} from "@codemirror/autocomplete"
import {syntaxTree} from "@codemirror/language"
import {keymap} from "@codemirror/view"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Completion, CompletionContext, CompletionResult} from "@codemirror/autocomplete"
import type {Extension} from "@codemirror/state"
import type {EditorView} from "@codemirror/view"
import type {Tag} from "@daily/protocol"
import type {SyntaxNode} from "@lezer/common"

type SlashItem = {label: string; icon: IconName; run: (view: EditorView) => boolean}

type TagsAutocompleteOptions = {
  getTags: () => Tag[]
  getAttachedTags: () => Tag[]
  onAddTag: (tag: Tag) => void
  onRemoveTag: (tag: Tag) => void
}

type TagCommandMode = "add" | "remove"

type TagCompletionMeta = {color: string; mode: TagCommandMode}

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

/** Without `options` — a project or milestone description has nothing to tag — `/` still offers every block command, only without "Add Tag" and "Remove Tag". */
export function createCompletionExtension(options?: TagsAutocompleteOptions): Extension {
  const tagMetaByLabel = new Map<string, TagCompletionMeta>()
  const slashIconByLabel = new Map<string, IconName>(SLASH_ITEMS.map((item) => [`/${item.label}`, item.icon]))

  if (options) {
    createTagSlashItems(true).forEach((item) => slashIconByLabel.set(`/${item.label}`, item.icon))
  }

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
      override: options
        ? [createTagSlashCompletionSource(options, tagMetaByLabel), createSlashCompletionSource(options)]
        : [createSlashCompletionSource()],
    }),
    keymap.of(completionKeymap),
  ]
}

function createTagCompletions(
  tags: Tag[],
  query: string,
  mode: TagCommandMode,
  commandFrom: number,
  metaByLabel: Map<string, TagCompletionMeta>,
  onApply: (tag: Tag) => void,
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
          onApply(tag)
          view.focus()
        },
      } satisfies Completion
    })
}

function createTagSlashItems(shouldShowRemove: boolean): SlashItem[] {
  const addItem: SlashItem = {label: "Add Tag", icon: "tags", run: insertTagCommand("add")}
  const removeItem: SlashItem = {label: "Remove Tag", icon: "tags-off", run: insertTagCommand("remove")}

  return shouldShowRemove ? [addItem, removeItem] : [addItem]
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

function createTagSlashCompletionSource(
  options: TagsAutocompleteOptions,
  metaByLabel: Map<string, TagCompletionMeta>,
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
    const sourceTags = mode === "remove" ? options.getAttachedTags() : options.getTags()

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

function createSlashCompletionSource(options?: TagsAutocompleteOptions): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    const match = context.matchBefore(/\/[\w-]*/)
    if (!match) return null
    if (!context.explicit && match.from === match.to) return null

    const charBefore = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : "\n"
    if (charBefore !== "\n" && !/\s/.test(charBefore)) return null

    if (isInsideCode(context)) return null

    const tagItems = options ? createTagSlashItems(options.getAttachedTags().length > 0) : []
    const items = [...SLASH_ITEMS.slice(0, 1), ...tagItems, ...SLASH_ITEMS.slice(1)]

    return {from: match.from, to: match.to, options: items.map(toCompletion), validFor: /^\/[\w-]*$/}
  }
}

function toCompletion(item: SlashItem, index: number): Completion {
  return {
    label: `/${item.label}`,
    type: "keyword",
    sortText: String(index).padStart(2, "0"),
    apply: (view, _completion, from, to) => {
      view.dispatch({changes: {from, to, insert: ""}, selection: {anchor: from}})
      item.run(view)
      view.focus()
    },
  }
}

function isInsideCode(context: CompletionContext): boolean {
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(context.pos, -1)
  while (node) {
    if (node.name === "FencedCode" || node.name === "InlineCode" || node.name === "CodeText") return true
    node = node.parent
  }
  return false
}
