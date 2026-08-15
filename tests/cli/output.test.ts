// @ts-nocheck
import {DateTime} from "luxon"
import {describe, expect, it} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"
import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

import {exitCodeFor, formatTaskDetails, renderJsonError, renderJsonOk} from "@cli/output"

describe("output", () => {
  it("wraps success payloads", () => {
    expect(JSON.parse(renderJsonOk({tasks: []}))).toEqual({ok: true, data: {tasks: []}})
  })
  it("wraps errors", () => {
    expect(JSON.parse(renderJsonError("TASK_NOT_FOUND", "Task not found: abc"))).toEqual({
      ok: false,
      error: {code: "TASK_NOT_FOUND", message: "Task not found: abc"},
    })
  })
  it("maps CliError to its exit code, others to 1", () => {
    expect(exitCodeFor(new CliError(CliErrorCode.TASK_NOT_FOUND, "x"))).toBe(3)
    expect(exitCodeFor(new Error("boom"))).toBe(1)
  })
})

function headerLines(output) {
  const lines = output.split("\n")
  const blankIndex = lines.indexOf("")
  return blankIndex === -1 ? lines : lines.slice(0, blankIndex)
}

function bodyLines(output) {
  const lines = output.split("\n")
  const blankIndex = lines.indexOf("")
  return blankIndex === -1 ? [] : lines.slice(blankIndex + 1)
}

function label(line) {
  return line.slice(0, 9).trimEnd()
}

function value(line) {
  return line.slice(11)
}

function startsAtColumn12(line) {
  return line.slice(9, 11) === "  "
}

function lineFor(output, wantedLabel) {
  return headerLines(output).find((line) => label(line) === wantedLabel)
}

const BASE_TASK = {
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
  deletedAt: null,
  branchId: "main",
  scheduled: {date: "2026-08-15", time: "", timezone: "UTC"},
  estimatedTime: 0,
  spentTime: 0,
  content: "",
  minimized: false,
  orderIndex: 1,
  status: "active",
  tags: [],
  attachments: [],
}

describe("formatTaskDetails", () => {
  it("TC-1: orders the header id, status, scheduled, project, tags, estimate, spent, created, updated, files, starts every value at column 12, then one blank line, then content", () => {
    const createdAt = "2026-08-13T23:58:00.000Z"
    const updatedAt = "2026-08-13T22:10:00.000Z"
    const task = {
      ...BASE_TASK,
      id: "T1",
      createdAt,
      updatedAt,
      scheduled: {date: "2026-08-15", time: "23:58:43", timezone: "Asia/Vladivostok"},
      estimatedTime: 5400,
      spentTime: 2700,
      content: "Body text",
      tags: [
        {id: "tag1", name: "Daily", color: "#000", createdAt: "", updatedAt: "", deletedAt: null},
        {id: "tag2", name: "Feature", color: "#000", createdAt: "", updatedAt: "", deletedAt: null},
      ],
    }
    const detail = {task, projectName: "main", files: [{id: "f1", path: "/assets/f1.png"}]}

    const output = formatTaskDetails([detail])
    const header = headerLines(output)

    expect(header.map(label)).toEqual(["id", "status", "scheduled", "project", "tags", "estimate", "spent", "created", "updated", "files"])
    expect(header.every(startsAtColumn12)).toBe(true)
    expect(value(lineFor(output, "id"))).toBe("T1")
    expect(value(lineFor(output, "status"))).toBe("active")
    expect(value(lineFor(output, "scheduled"))).toBe("2026-08-15 23:58  Asia/Vladivostok")
    expect(value(lineFor(output, "project"))).toBe("main")
    expect(value(lineFor(output, "tags"))).toBe("Daily, Feature")
    expect(value(lineFor(output, "estimate"))).toBe("1h 30m")
    expect(value(lineFor(output, "spent"))).toBe("45m")
    expect(value(lineFor(output, "created"))).toBe(DateTime.fromISO(createdAt).toFormat("yyyy-MM-dd HH:mm"))
    expect(value(lineFor(output, "updated"))).toBe(DateTime.fromISO(updatedAt).toFormat("yyyy-MM-dd HH:mm"))
    expect(value(lineFor(output, "files"))).toBe("f1  /assets/f1.png")
    expect(bodyLines(output)).toEqual(["Body text"])
  })

  it("TC-1a: keeps every header label at 9 characters or fewer — including deleted and attached — so every value starts at column 12", () => {
    const task = {
      ...BASE_TASK,
      id: "T1a",
      deletedAt: "2026-08-14T10:02:00.000Z",
      scheduled: {date: "2026-08-15", time: "23:58:43", timezone: "UTC"},
      estimatedTime: 60,
      spentTime: 60,
      tags: [{id: "tag1", name: "Daily", color: "#000", createdAt: "", updatedAt: "", deletedAt: null}],
      attachments: ["f1", "f2"],
    }
    const detail = {task, projectName: "main", files: [{id: "f1", path: "/assets/f1.png"}]}

    const header = headerLines(formatTaskDetails([detail]))
    const labels = header.map(label)

    expect(labels).toEqual([
      "id",
      "status",
      "scheduled",
      "project",
      "tags",
      "estimate",
      "spent",
      "created",
      "updated",
      "deleted",
      "files",
      "attached",
    ])
    for (const l of labels) expect(l.length).toBeLessThanOrEqual(9)
    expect(header.every(startsAtColumn12)).toBe(true)
  })

  it("TC-2: prints an em dash for empty tags, zero estimate/spent, and no files", () => {
    const task = {...BASE_TASK, id: "T2"}
    const output = formatTaskDetails([{task, projectName: "main", files: []}])

    expect(value(lineFor(output, "tags"))).toBe("—")
    expect(value(lineFor(output, "estimate"))).toBe("—")
    expect(value(lineFor(output, "spent"))).toBe("—")
    expect(value(lineFor(output, "files"))).toBe("—")
  })

  it("TC-3: renders h/m durations from estimatedTime and spentTime seconds", () => {
    const taskA = {...BASE_TASK, id: "A", estimatedTime: 5400, spentTime: 2700}
    const taskB = {...BASE_TASK, id: "B", estimatedTime: 7200, spentTime: 0}

    const outputA = formatTaskDetails([{task: taskA, projectName: "main", files: []}])
    const outputB = formatTaskDetails([{task: taskB, projectName: "main", files: []}])

    expect(value(lineFor(outputA, "estimate"))).toBe("1h 30m")
    expect(value(lineFor(outputA, "spent"))).toBe("45m")
    expect(value(lineFor(outputB, "estimate"))).toBe("2h")
  })

  it("TC-4: reproduces multiline content verbatim — untruncated, unpadded, with its original line breaks", () => {
    const longFirstLine = "X".repeat(85)
    const content = `${longFirstLine}\nsecond line\nthird line with trailing spaces   `
    const task = {...BASE_TASK, id: "T4", content}

    const output = formatTaskDetails([{task, projectName: "main", files: []}])

    expect(bodyLines(output).join("\n")).toBe(content)
  })

  it("TC-5: omits deleted/attached when empty, includes both with their values when present", () => {
    const taskA = {...BASE_TASK, id: "A", deletedAt: null, attachments: []}
    const deletedAtIso = "2026-08-14T10:02:00.000Z"
    const taskB = {...BASE_TASK, id: "B", deletedAt: deletedAtIso, attachments: ["f1", "f2"]}

    const outputA = formatTaskDetails([{task: taskA, projectName: "main", files: []}])
    const outputB = formatTaskDetails([{task: taskB, projectName: "main", files: []}])

    expect(headerLines(outputA).map(label)).not.toContain("deleted")
    expect(headerLines(outputA).map(label)).not.toContain("attached")

    expect(headerLines(outputB).map(label)).toContain("deleted")
    expect(headerLines(outputB).map(label)).toContain("attached")
    expect(value(lineFor(outputB, "attached"))).toBe("f1, f2")
    expect(value(lineFor(outputB, "deleted"))).toBe(DateTime.fromISO(deletedAtIso).toFormat("yyyy-MM-dd HH:mm"))
  })

  it("TC-6: renders --:-- for an empty scheduled time and HH:MM for a present one", () => {
    const noTime = {...BASE_TASK, id: "T6a", scheduled: {date: "2026-08-15", time: "", timezone: "UTC"}}
    const withTime = {...BASE_TASK, id: "T6b", scheduled: {date: "2026-08-15", time: "23:58:43", timezone: "UTC"}}

    const outputNoTime = formatTaskDetails([{task: noTime, projectName: "main", files: []}])
    const outputWithTime = formatTaskDetails([{task: withTime, projectName: "main", files: []}])

    expect(value(lineFor(outputNoTime, "scheduled"))).toBe("2026-08-15 --:--  UTC")
    expect(value(lineFor(outputWithTime, "scheduled"))).toBe("2026-08-15 23:58  UTC")
  })
})
