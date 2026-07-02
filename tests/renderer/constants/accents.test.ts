import {describe, expect, it} from "vitest"

import {ACCENT_PRESETS, DEFAULT_ACCENT_ID, resolveAccentValue} from "@shared/constants/theme"

describe("accent presets", () => {
  it("exposes 10 presets with unique ids", () => {
    expect(ACCENT_PRESETS).toHaveLength(10)
    const ids = ACCENT_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("default id resolves to a preset", () => {
    expect(ACCENT_PRESETS.some((p) => p.id === DEFAULT_ACCENT_ID)).toBe(true)
  })

  it("resolveAccentValue returns the preset value, or the default for unknown ids", () => {
    expect(resolveAccentValue("teal")).toBe("oklch(72% 0.17 190)")
    const fallback = ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!.value
    expect(resolveAccentValue("does-not-exist")).toBe(fallback)
  })
})
