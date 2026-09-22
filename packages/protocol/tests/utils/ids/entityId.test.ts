import {describe, expect, it} from "vitest"

import {createEntityId, ENTITY_ID_PREFIX} from "../../../src/utils/ids/entityId"

import type {EntityIdKind} from "../../../src/utils/ids/entityId"

const KINDS = Object.keys(ENTITY_ID_PREFIX) as EntityIdKind[]

describe("createEntityId", () => {
  it.each([
    ["task", "DT"],
    ["tag", "DG"],
    ["branch", "DP"],
    ["milestone", "DM"],
    ["file", "DF"],
    ["comment", "DC"],
  ] as const)("marks a %s id with %s and a single separating hyphen", (kind, prefix) => {
    const id = createEntityId(kind)

    expect(id.startsWith(`${prefix}-`)).toBe(true)
    expect(id.indexOf("-")).toBe(2)
  })

  it("draws the random part from an alphanumeric alphabet, so the first hyphen is always the end of the mark", () => {
    for (const kind of KINDS) {
      for (let attempt = 0; attempt < 200; attempt++) {
        expect(createEntityId(kind).slice(3)).toMatch(/^[0-9A-Za-z]{21}$/)
      }
    }
  })

  it("never repeats an id across calls for the same kind", () => {
    const ids = new Set(Array.from({length: 1000}, () => createEntityId("task")))

    expect(ids.size).toBe(1000)
  })
})
