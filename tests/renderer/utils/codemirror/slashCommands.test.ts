import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createSlashCompletionSource, slashCompletionSource, slashIconByLabel} from "@/utils/codemirror/extensions/slashCommands"

import {CompletionContext} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"

function complete(doc: string, pos: number, explicit = false) {
  const state = EditorState.create({doc, selection: {anchor: pos}, extensions: [createMarkdownLanguageExtension()]})
  return slashCompletionSource(new CompletionContext(state, pos, explicit))
}

describe("slashCompletionSource", () => {
  it("offers commands on '/' at line start, anchored at the slash", () => {
    const res = complete("/", 1)
    expect(res).not.toBeNull()
    expect(res!.from).toBe(0) // anchored at '/' so CM matches against the '/query'
    expect(res!.options.length).toBe(slashIconByLabel.size)
  })

  it("uses '/'-prefixed labels so CodeMirror's matcher keeps them", () => {
    const labels = complete("/", 1)!.options.map((o) => o.label)
    expect(labels).toContain("/Heading 1")
    expect(labels).toContain("/Code Block")
    expect(labels.every((l) => l.startsWith("/"))).toBe(true)
  })

  it("triggers after whitespace too", () => {
    expect(complete("text /", 6)).not.toBeNull()
  })

  it("does not trigger mid-word (e.g. a path)", () => {
    expect(complete("path/to", 7)).toBeNull()
  })

  it("does not trigger inside a fenced code block", () => {
    expect(complete("```js\n/\n```\n", 7)).toBeNull()
  })

  it("can insert extra command items after divider", () => {
    const source = createSlashCompletionSource([{label: "Add Tag", icon: "tags", run: () => true}])
    const state = EditorState.create({doc: "/", selection: {anchor: 1}, extensions: [createMarkdownLanguageExtension()]})
    const res = source(new CompletionContext(state, 1, false))

    expect(res?.options[0].label).toBe("/Divider")
    expect(res?.options[1].label).toBe("/Add Tag")
    expect(res?.options.map((o) => o.label)).toContain("/Heading 1")
  })

  it("can resolve extra command items dynamically", () => {
    let includeRemove = false
    const source = createSlashCompletionSource(() =>
      includeRemove
        ? [
            {label: "Add Tag", icon: "tags", run: () => true},
            {label: "Remove Tag", icon: "tags-off", run: () => true},
          ]
        : [{label: "Add Tag", icon: "tags", run: () => true}],
    )
    const state = EditorState.create({doc: "/", selection: {anchor: 1}, extensions: [createMarkdownLanguageExtension()]})

    expect(source(new CompletionContext(state, 1, false))?.options.map((o) => o.label)).not.toContain("/Remove Tag")

    includeRemove = true

    expect(source(new CompletionContext(state, 1, false))?.options.map((o) => o.label)).toContain("/Remove Tag")
  })
})

describe("slash menu ordering", () => {
  it("assigns sortText in declared order so related items stay grouped", () => {
    const options = complete("/", 1)!.options
    const byOrder = [...options].sort((a, b) => (a.sortText ?? "").localeCompare(b.sortText ?? ""))
    const labels = byOrder.map((o) => o.label.replace(/^\//, ""))

    const bullet = labels.indexOf("Bullet List")
    expect(labels[bullet + 1]).toBe("Numbered List") // adjacent
    expect(labels[0]).toBe("Divider")
    expect(labels.slice(1, 7)).toEqual(["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5", "Heading 6"])
  })
})
