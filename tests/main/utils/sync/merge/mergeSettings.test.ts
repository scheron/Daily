// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeSettings} from "@main/utils/sync/merge/mergeSettings"

const now = "2026-03-25T12:00:00.000Z"
const old = "2026-03-25T10:00:00.000Z"

function makeSettings(updatedAt, extra = {}) {
  return {id: "default", version: "1", created_at: old, updated_at: updatedAt, ...extra}
}

describe("mergeSettings", () => {
  it("returns null when both null", () => {
    expect(mergeSettings(null, null, "pull")).toBeNull()
  })

  it("returns remote when local is null", () => {
    const remote = makeSettings(now)
    expect(mergeSettings(null, remote, "pull")).toBe(remote)
  })

  it("returns local when remote is null", () => {
    const local = makeSettings(now)
    expect(mergeSettings(local, null, "pull")).toBe(local)
  })

  it("returns newer by updated_at", () => {
    const local = makeSettings(old, {source: "local"})
    const remote = makeSettings(now, {source: "remote"})
    expect(mergeSettings(local, remote, "pull").source).toBe("remote")
    expect(mergeSettings(remote, local, "pull").source).toBe("remote")
  })

  it("pull strategy: remote wins on tie", () => {
    const local = makeSettings(now, {source: "local"})
    const remote = makeSettings(now, {source: "remote"})
    expect(mergeSettings(local, remote, "pull").source).toBe("remote")
  })

  it("push strategy: local wins on tie", () => {
    const local = makeSettings(now, {source: "local"})
    const remote = makeSettings(now, {source: "remote"})
    expect(mergeSettings(local, remote, "push").source).toBe("local")
  })
})
