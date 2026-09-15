import {describe, expect, it} from "vitest"

import {ensureSyntaxTree} from "@codemirror/language"
import {EditorState} from "@codemirror/state"
import {createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions/markdownLanguage"
import {
  createOrderedListRenumberExtension,
  skipOrderedListRenumber,
} from "../../../../src/renderer/src/utils/codemirror/extensions/orderedListRenumber"

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

  it("keeps the list's start when its first item is deleted", () => {
    const result = applyAndRead("3. a\n4. b\n5. c", {
      from: 0,
      to: 5,
      insert: "",
    })

    expect(result).toBe("3. b\n4. c")
  })

  it("restarts the list from a first number typed over the old one", () => {
    const result = applyAndRead("1. a\n2. b", {
      from: 0,
      to: 1,
      insert: "5",
    })

    expect(result).toBe("5. a\n6. b")
  })

  it("keeps the numbers of a list pasted where there was no list", () => {
    const result = applyAndRead("intro\n\n", {
      from: 7,
      to: 7,
      insert: "3. a\n4. b",
    })

    expect(result).toBe("intro\n\n3. a\n4. b")
  })

  it("takes the start of the nested list that was at the same level", () => {
    const result = applyAndRead("3. a\n   7. x\n   8. y", {
      from: 5,
      to: 5,
      insert: "   9. new\n",
    })

    expect(result).toBe("3. a\n   7. new\n   8. x\n   9. y")
  })

  it("never takes a nested list's start from the outer list", () => {
    const result = applyAndRead("3. a\n   - x\n   - y\n4. b", {
      from: 8,
      to: 18,
      insert: "5. x\n   6. y",
    })

    expect(result).toBe("3. a\n   5. x\n   6. y\n4. b")
  })

  it("treats a list pasted over the whole old list as a new list", () => {
    const result = applyAndRead("1. a\n2. b", {
      from: 0,
      to: 9,
      insert: "3. x\n4. y",
    })

    expect(result).toBe("3. x\n4. y")
  })

  it("keeps the numbers of a list that only touches the old one", () => {
    const result = applyAndRead("3. a", {
      from: 4,
      to: 4,
      insert: "\n7) x",
    })

    expect(result).toBe("3. a\n7) x")
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
