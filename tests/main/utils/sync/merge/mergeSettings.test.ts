// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeSettings} from "@main/utils/sync/merge/mergeSettings"

function makeSettings(overrides = {}) {
  return {
    id: "settings",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    branch: {activeId: "main"},
    sync: {enabled: false, path: ""},
    theme: {mode: "light", palette: "default"},
    ...overrides,
  }
}

describe("mergeSettings", () => {
  it("returns null when both local and remote are null", () => {
    expect(mergeSettings(null, null, "pull")).toBeNull()
  })

  it("returns remote when local is null", () => {
    const remote = makeSettings({updated_at: "2026-06-01T00:00:00.000Z"})
    expect(mergeSettings(null, remote, "pull")).toBe(remote)
  })

  it("returns local when remote is null", () => {
    const local = makeSettings({updated_at: "2026-06-01T00:00:00.000Z"})
    expect(mergeSettings(local, null, "pull")).toBe(local)
  })

  it("returns local when local is newer regardless of strategy", () => {
    const local = makeSettings({updated_at: "2026-06-01T00:00:00.000Z"})
    const remote = makeSettings({updated_at: "2026-01-01T00:00:00.000Z"})

    expect(mergeSettings(local, remote, "pull")).toBe(local)
    expect(mergeSettings(local, remote, "push")).toBe(local)
  })

  it("returns remote when remote is newer regardless of strategy", () => {
    const local = makeSettings({updated_at: "2026-01-01T00:00:00.000Z"})
    const remote = makeSettings({updated_at: "2026-06-01T00:00:00.000Z"})

    expect(mergeSettings(local, remote, "pull")).toBe(remote)
    expect(mergeSettings(local, remote, "push")).toBe(remote)
  })

  it("tie-break: pull strategy returns remote", () => {
    const ts = "2026-03-24T00:00:00.000Z"
    const local = makeSettings({updated_at: ts})
    const remote = makeSettings({updated_at: ts})

    expect(mergeSettings(local, remote, "pull")).toBe(remote)
  })

  it("tie-break: push strategy returns local", () => {
    const ts = "2026-03-24T00:00:00.000Z"
    const local = makeSettings({updated_at: ts})
    const remote = makeSettings({updated_at: ts})

    expect(mergeSettings(local, remote, "push")).toBe(local)
  })
})
