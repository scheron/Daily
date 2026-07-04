import {describe, expect, it, vi} from "vitest"

import {createTagSlashCompletionSource, createTagSlashItems} from "@/utils/codemirror/extensions/completion"
import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createSlashCompletionSource} from "@/utils/codemirror/extensions/slashCommands"

import {CompletionContext} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {Completion} from "@codemirror/autocomplete"
import type {Tag} from "@shared/types/storage"

function tag(name: string, overrides: Partial<Tag> = {}): Tag {
  return {
    id: `tag:${name}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    name,
    color: "#888888",
    ...overrides,
  }
}

function state(doc: string) {
  return EditorState.create({doc, selection: {anchor: doc.length}, extensions: [createMarkdownLanguageExtension()]})
}

describe("tag slash commands", () => {
  const work = tag("Work")
  const home = tag("Home")

  it("hides /Remove Tag from the slash menu when the task has no tags", () => {
    const source = createSlashCompletionSource(() => createTagSlashItems(false))
    const res = source(new CompletionContext(state("/"), 1, false))
    const labels = res?.options.map((o) => o.label)

    expect(labels).toContain("/Add Tag")
    expect(labels).not.toContain("/Remove Tag")
  })

  it("shows tag commands after divider when the task has tags", () => {
    const source = createSlashCompletionSource(() => createTagSlashItems(true))
    const res = source(new CompletionContext(state("/"), 1, false))
    const labels = res?.options.map((o) => o.label)

    expect(labels?.slice(0, 3)).toEqual(["/Divider", "/Add Tag", "/Remove Tag"])
  })

  it("offers tags after /Add Tag", () => {
    const source = createTagSlashCompletionSource({getTags: () => [work, home]})
    const res = source(new CompletionContext(state("/Add Tag "), "/Add Tag ".length, false))

    expect(res?.from).toBe("/Add Tag ".length)
    expect(res?.options.map((o) => o.label)).toEqual(["Home", "Work"])
  })

  it("filters remove options to attached tags", () => {
    const source = createTagSlashCompletionSource({
      getTags: () => [work, home],
      getAttachedTags: () => [work],
    })
    const res = source(new CompletionContext(state("/Remove Tag "), "/Remove Tag ".length, false))

    expect(res?.options.map((o) => o.label)).toEqual(["Work"])
  })

  it("removes the slash command and applies the selected add tag", () => {
    const onAddTag = vi.fn()
    const doc = "/Add Tag wo"
    const source = createTagSlashCompletionSource({getTags: () => [work], onAddTag})
    const res = source(new CompletionContext(state(doc), doc.length, true))
    const option = res?.options[0] as Completion & {apply: NonNullable<Completion["apply"]>}

    const parent = document.createElement("div")
    document.body.appendChild(parent)
    const view = new EditorView({state: state(doc), parent})

    option.apply(view, option, res!.from, res!.to)

    expect(view.state.doc.toString()).toBe("")
    expect(onAddTag).toHaveBeenCalledWith(work)

    view.destroy()
    parent.remove()
  })
})
