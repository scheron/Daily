// @ts-nocheck
import {describe, expect, it} from "vitest"

import {describeToolCall} from "../../../../src/main/ai/policy/describeToolCall"

function fakeStorage(overrides = {}) {
  return {
    getTask: async () => null,
    getBranch: async () => null,
    getMilestone: async () => null,
    getTag: async () => null,
    getFiles: async () => [],
    ...overrides,
  }
}

describe("describeToolCall", () => {
  it("returns a title and summary for delete_task, naming the task's content when it is found", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "Buy milk\nand eggs"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.title).toMatch(/move.*trash/i)
    expect(d.summary).toContain("Buy milk")
    expect(d.details?.[0]).toContain("abc123")
  })

  it("falls back to the id when the task cannot be found", async () => {
    const d = await describeToolCall("delete_task", {id: "abc123"}, fakeStorage())
    expect(d.summary).toContain("abc123")
  })

  it("never throws when the lookup itself throws", async () => {
    const storage = fakeStorage({
      getTask: async () => {
        throw new Error("db down")
      },
    })
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("abc123")
  })

  it("names the project in delete_project's card when found, and the id when not", async () => {
    const found = await describeToolCall("delete_project", {id: "p1"}, fakeStorage({getBranch: async () => ({name: "Chelsea"})}))
    expect(found.title).toBeTruthy()
    expect(found.summary).toContain("Chelsea")

    const missing = await describeToolCall("delete_project", {id: "p1"}, fakeStorage())
    expect(missing.summary).toContain("p1")
  })

  it("names the milestone in delete_milestone's card when found, and the id when not", async () => {
    const found = await describeToolCall("delete_milestone", {id: "m1"}, fakeStorage({getMilestone: async () => ({name: "Launch"})}))
    expect(found.title).toBeTruthy()
    expect(found.summary).toContain("Launch")

    const missing = await describeToolCall("delete_milestone", {id: "m1"}, fakeStorage())
    expect(missing.summary).toContain("m1")
  })

  it("names the tag in delete_tag's card when found, and the id when not", async () => {
    const found = await describeToolCall("delete_tag", {id: "t1"}, fakeStorage({getTag: async () => ({name: "urgent"})}))
    expect(found.title).toBeTruthy()
    expect(found.summary).toContain("urgent")

    const missing = await describeToolCall("delete_tag", {id: "t1"}, fakeStorage())
    expect(missing.summary).toContain("t1")
  })

  it("names the attachment in delete_attachment's card when found, and the id when not", async () => {
    const found = await describeToolCall("delete_attachment", {id: "f1"}, fakeStorage({getFiles: async () => [{name: "shot.png"}]}))
    expect(found.title).toBeTruthy()
    expect(found.summary).toContain("shot.png")

    const missing = await describeToolCall("delete_attachment", {id: "f1"}, fakeStorage())
    expect(missing.summary).toContain("f1")
  })

  it("names the comment by its id in delete_comment's card — no per-comment lookup exists to name it otherwise", async () => {
    const d = await describeToolCall("delete_comment", {id: "c1"}, fakeStorage())
    expect(d.title).toBeTruthy()
    expect(d.summary).toContain("c1")
  })

  it("strips a leading Markdown heading marker from delete_task's label", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "# Buy milk\nand eggs"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("Buy milk")
    expect(d.summary).not.toContain("#")
  })

  it("strips a leading Markdown heading marker even behind leading whitespace", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "   # Buy milk\nand eggs"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("Buy milk")
    expect(d.summary).not.toContain("#")
  })

  it("keeps a leading hashtag that carries no space after it — it is not a heading marker", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "#urgent buy milk"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("#urgent buy milk")
  })

  it("falls back to the id, never labelling the card with a bare heading marker, when the first line is only '#'", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "#\nBuy milk"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("abc123")
    expect(d.summary).not.toContain('"#"')
  })

  it("falls back to the id when the first line is a heading marker with only trailing whitespace", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "##   \nBuy milk"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("abc123")
    expect(d.summary).not.toContain('"##"')
  })

  it("falls back to the id, never an empty label, when the task's first line is blank", async () => {
    const storage = fakeStorage({getTask: async () => ({content: "\nBuy milk"})})
    const d = await describeToolCall("delete_task", {id: "abc123"}, storage)
    expect(d.summary).toContain("abc123")
    expect(d.summary).not.toContain('""')
  })

  it("falls back to a generic title for unknown tool names", async () => {
    const d = await describeToolCall("some_future_destructive", {}, fakeStorage())
    expect(d.title).toBeTruthy()
    expect(d.summary).toBeTruthy()
  })

  it("never throws on missing or malformed params", async () => {
    await expect(describeToolCall("delete_task", {}, fakeStorage())).resolves.toBeTruthy()
    await expect(describeToolCall("delete_task", null as any, fakeStorage())).resolves.toBeTruthy()
  })
})
