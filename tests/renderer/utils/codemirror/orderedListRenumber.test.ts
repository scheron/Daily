import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createOrderedListRenumberExtension, skipOrderedListRenumber} from "@/utils/codemirror/extensions/orderedListRenumber"

import {ensureSyntaxTree} from "@codemirror/language"
import {EditorState} from "@codemirror/state"

import type {ChangeSpec, TransactionSpec} from "@codemirror/state"

function makeState(doc: string): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [createMarkdownLanguageExtension(), createOrderedListRenumberExtension()],
  })

  ensureSyntaxTree(state, doc.length, 5_000)
  return state
}

function applyAndRead(doc: string, changes: ChangeSpec, options: Pick<TransactionSpec, "annotations"> = {}): string {
  return makeState(doc)
    .update({changes, ...options})
    .state.doc.toString()
}

describe("createOrderedListRenumberExtension", () => {
  it("renumbers when a line is moved past another item", () => {
    const result = applyAndRead("1. one\n2. two\n3. three", {
      from: 0,
      to: 13,
      insert: "2. two\n1. one",
    })

    expect(result).toBe("1. two\n2. one\n3. three")
  })

  it("renumbers after a middle item is deleted", () => {
    const result = applyAndRead("1. a\n2. b\n3. c\n4. d", {
      from: 5,
      to: 10,
      insert: "",
    })

    expect(result).toBe("1. a\n2. c\n3. d")
  })

  it("renumbers after pasting a new item between existing ones", () => {
    const result = applyAndRead("1. a\n2. b\n3. c", {
      from: 5,
      to: 5,
      insert: "1. new\n",
    })

    expect(result).toBe("1. a\n2. new\n3. b\n4. c")
  })

  it("keeps a deliberate non-1 start for in-place edits", () => {
    const result = applyAndRead("5. a\n6. b\n7. c", {
      from: 14,
      to: 14,
      insert: " tail",
    })

    expect(result).toBe("5. a\n6. b\n7. c tail")
  })

  it("leaves bullet lists alone", () => {
    const result = applyAndRead("- one\n- two\n- three", {
      from: 5,
      to: 5,
      insert: " x",
    })

    expect(result).toBe("- one x\n- two\n- three")
  })

  it("leaves numbered-looking lines inside fenced code blocks alone", () => {
    const doc = "```\n1. one\n5. two\n```"
    const result = applyAndRead(doc, {
      from: doc.length,
      to: doc.length,
      insert: "\n",
    })

    expect(result).toBe("```\n1. one\n5. two\n```\n")
  })

  it("skips renumbering for programmatic content replacement", () => {
    const result = applyAndRead("1. a\n5. b\n9. c", {from: 14, to: 14, insert: " "}, {annotations: skipOrderedListRenumber.of(true)})

    expect(result).toBe("1. a\n5. b\n9. c ")
  })
})
