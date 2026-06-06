// @ts-nocheck
import {describe, expect, it} from "vitest"

import {describeToolCall} from "@main/ai/policy/describeToolCall"

describe("describeToolCall", () => {
  it("returns a title and summary for delete_task", () => {
    const d = describeToolCall("delete_task", {task_id: "abc123"})
    expect(d.title).toMatch(/move.*trash/i)
    expect(d.summary).toContain("abc123")
  })

  it("returns a strong-warning title for permanently_delete_task", () => {
    const d = describeToolCall("permanently_delete_task", {task_id: "abc123"})
    expect(d.title).toMatch(/permanent/i)
    expect(d.summary).toContain("abc123")
  })

  it("returns a title for delete_project, delete_tag, remove_task_attachment", () => {
    expect(describeToolCall("delete_project", {project_id: "p1"}).title).toBeTruthy()
    expect(describeToolCall("delete_tag", {tag_id: "t1"}).title).toBeTruthy()
    expect(describeToolCall("remove_task_attachment", {task_id: "t1", file_id: "f1"}).title).toBeTruthy()
  })

  it("falls back to a generic title for unknown tool names", () => {
    const d = describeToolCall("some_future_destructive", {})
    expect(d.title).toBeTruthy()
    expect(d.summary).toBeTruthy()
  })

  it("never throws on missing or malformed params", () => {
    expect(() => describeToolCall("delete_task", {})).not.toThrow()
    expect(() => describeToolCall("delete_task", null as any)).not.toThrow()
  })
})
