import {describe, expect, it} from "vitest"

import {RequestLogBuffer} from "../../../src/utils/requestLog/RequestLogBuffer"

import type {RequestLogEntry} from "@daily/protocol"

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    at: "2026-11-11T10:00:00.000Z",
    firstAt: "2026-11-11T10:00:00.000Z",
    level: "info",
    source: "server",
    method: "GET",
    path: "/v1/revision",
    status: 200,
    durationMs: 10,
    device: "Air",
    error: null,
    ...overrides,
  }
}

describe("RequestLogBuffer", () => {
  it("keeps the newest 1000 entries, oldest first", () => {
    const buffer = new RequestLogBuffer()
    for (let i = 0; i < 1001; i++) buffer.add(entry({method: "POST", path: `/v1/n${i}`}))

    const list = buffer.list()
    expect(list).toHaveLength(1000)
    expect(list[0].path).toBe("/v1/n1")
    expect(list[999].path).toBe("/v1/n1000")
  })

  it("folds a repeated revision poll into one entry spanning first to last and moves it to the end", () => {
    const buffer = new RequestLogBuffer()
    buffer.add(entry({at: "2026-11-11T10:00:00.000Z", firstAt: "2026-11-11T10:00:00.000Z"}))
    buffer.add(entry({at: "2026-11-11T10:05:00.000Z", firstAt: "2026-11-11T10:05:00.000Z", durationMs: 45_000}))

    expect(buffer.list()).toEqual([entry({at: "2026-11-11T10:05:00.000Z", firstAt: "2026-11-11T10:00:00.000Z", durationMs: 45_000})])
  })

  it("is not interrupted by another device's poll, and each device keeps its own series", () => {
    const buffer = new RequestLogBuffer()
    buffer.add(entry({device: "Air", at: "2026-11-11T10:00:00.000Z", firstAt: "2026-11-11T10:00:00.000Z"}))
    buffer.add(entry({device: "Mini", at: "2026-11-11T10:01:00.000Z", firstAt: "2026-11-11T10:01:00.000Z"}))
    buffer.add(entry({device: "Air", at: "2026-11-11T10:02:00.000Z", firstAt: "2026-11-11T10:02:00.000Z"}))
    buffer.add(entry({device: "Mini", at: "2026-11-11T10:03:00.000Z", firstAt: "2026-11-11T10:03:00.000Z"}))

    expect(buffer.list().map((e) => [e.device, e.firstAt, e.at])).toEqual([
      ["Air", "2026-11-11T10:00:00.000Z", "2026-11-11T10:02:00.000Z"],
      ["Mini", "2026-11-11T10:01:00.000Z", "2026-11-11T10:03:00.000Z"],
    ])
  })

  it("starts a new series after any other request", () => {
    const buffer = new RequestLogBuffer()
    buffer.add(entry())
    buffer.add(entry({method: "POST", path: "/v1/agents/revoke"}))
    buffer.add(entry())

    expect(buffer.list().map((e) => e.path)).toEqual(["/v1/revision", "/v1/agents/revoke", "/v1/revision"])
  })

  it("folds failures only when status and text match", () => {
    const buffer = new RequestLogBuffer()
    const failure = {level: "error", status: null, error: "UNREACHABLE: timed out"} as const
    buffer.add(entry(failure))
    buffer.add(entry(failure))
    buffer.add(entry({...failure, error: "UNREACHABLE: refused"}))
    buffer.add(entry())

    expect(buffer.list().map((e) => e.error)).toEqual(["UNREACHABLE: timed out", "UNREACHABLE: refused", null])
  })
})
