import {describe, expect, it} from "vitest"

import {BASE_PRESETS, DEFAULT_BASE_ID, resolveBasePreset} from "@shared/constants/theme"

describe("base presets", () => {
  it("exposes 5 presets with unique ids", () => {
    expect(BASE_PRESETS).toHaveLength(5)
    const ids = BASE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("default id resolves to a preset", () => {
    expect(BASE_PRESETS.some((p) => p.id === DEFAULT_BASE_ID)).toBe(true)
  })

  it("the default preset matches the current hardcoded theme.css values", () => {
    const cool = resolveBasePreset(DEFAULT_BASE_ID)
    expect(cool.light.base100).toBe("oklch(98% 0.01 265.754)")
    expect(cool.dark.base100).toBe("oklch(15% 0.02 265)")
  })

  it("resolveBasePreset falls back to the default for unknown ids", () => {
    expect(resolveBasePreset("does-not-exist")).toBe(resolveBasePreset(DEFAULT_BASE_ID))
  })
})
