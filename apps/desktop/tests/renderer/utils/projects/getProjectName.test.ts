import {describe, expect, it} from "vitest"

import {getProjectName} from "../../../../src/renderer/src/utils/projects/getProjectName"

import type {Branch} from "@daily/protocol"

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: "leki",
    name: "Leki",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("getProjectName", () => {
  it("reads main as No project, never by its stored name", () => {
    expect(getProjectName(makeBranch({id: "main", name: "Main"}))).toBe("No project")
  })

  it("reads a project that is not loaded as No project, and any other by its own name", () => {
    expect(getProjectName(undefined)).toBe("No project")
    expect(getProjectName(makeBranch())).toBe("Leki")
  })
})
