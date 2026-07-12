// @ts-nocheck
import {describe, expect, it} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"
import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

import {exitCodeFor, renderJsonError, renderJsonOk} from "@cli/output"

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
