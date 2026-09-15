import {describe, expect, it} from "vitest"

import {ensureSyntaxTree} from "@codemirror/language"
import {EditorState} from "@codemirror/state"
import {
  createMarkdownLanguageExtension,
  createOrderedListRenumberExtension,
  skipOrderedListRenumber,
} from "../../../../src/renderer/src/utils/codemirror/extensions"

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
  it("renumbers the rest of the list after an item is moved, deleted or pasted", () => {
    const moved = applyAndRead("1. one\n2. two\n3. three", {
      from: 0,
      to: 13,
      insert: "2. two\n1. one",
    })
    expect(moved).toBe("1. two\n2. one\n3. three")

    const deleted = applyAndRead("1. a\n2. b\n3. c\n4. d", {
      from: 5,
      to: 10,
      insert: "",
    })
    expect(deleted).toBe("1. a\n2. c\n3. d")

    const pasted = applyAndRead("1. a\n2. b\n3. c", {
      from: 5,
      to: 5,
      insert: "1. new\n",
    })
    expect(pasted).toBe("1. a\n2. new\n3. b\n4. c")
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

  it("takes the start only from the list at the same nesting level", () => {
    const sameLevel = applyAndRead("3. a\n   7. x\n   8. y", {
      from: 5,
      to: 5,
      insert: "   9. new\n",
    })
    expect(sameLevel).toBe("3. a\n   7. new\n   8. x\n   9. y")

    const outerLevel = applyAndRead("3. a\n   - x\n   - y\n4. b", {
      from: 8,
      to: 18,
      insert: "5. x\n   6. y",
    })
    expect(outerLevel).toBe("3. a\n   5. x\n   6. y\n4. b")
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

  it("renumbers only ordered lists, not bullets or numbered lines inside a code fence", () => {
    const bulletList = applyAndRead("- one\n- two\n- three", {
      from: 5,
      to: 5,
      insert: " x",
    })
    expect(bulletList).toBe("- one x\n- two\n- three")

    const codeFence = "```\n1. one\n5. two\n```"
    const fenced = applyAndRead(codeFence, {
      from: codeFence.length,
      to: codeFence.length,
      insert: "\n",
    })
    expect(fenced).toBe("```\n1. one\n5. two\n```\n")
  })

  it("skips renumbering for programmatic content replacement", () => {
    const result = applyAndRead("1. a\n5. b\n9. c", {from: 14, to: 14, insert: " "}, {annotations: skipOrderedListRenumber.of(true)})

    expect(result).toBe("1. a\n5. b\n9. c ")
  })
})
