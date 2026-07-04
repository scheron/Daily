import {describe, expect, it} from "vitest"

import {BASE_PRESETS, DEFAULT_BASE_ID} from "@shared/constants/theme"

describe("base presets", () => {
  it("exposes 5 presets with unique ids", () => {
    expect(BASE_PRESETS).toHaveLength(5)
    const ids = BASE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("default id resolves to a preset", () => {
    expect(BASE_PRESETS.some((p) => p.id === DEFAULT_BASE_ID)).toBe(true)
  })
})
