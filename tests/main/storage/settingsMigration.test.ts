import {describe, expect, it} from "vitest"

import {migrateSettingsShape} from "@main/storage/models/_rowMappers"

describe("migrateSettingsShape", () => {
  it("maps a dark theme to dark mode and its nearest accent", () => {
    const out = migrateSettingsShape({themes: {current: "aurora", useSystem: false}})
    expect(out.appearance).toEqual({mode: "dark", accent: "teal"})
    expect(out.themes).toBeUndefined()
  })

  it("maps a light theme to light mode", () => {
    const out = migrateSettingsShape({themes: {current: "ayu-light", useSystem: false}})
    expect(out.appearance.mode).toBe("light")
    expect(out.appearance.accent).toBe("orange")
  })

  it("uses system mode when useSystem was enabled", () => {
    const out = migrateSettingsShape({themes: {current: "github-dark", useSystem: true}})
    expect(out.appearance.mode).toBe("system")
  })

  it("falls back to the default accent for near-white/near-black old accents", () => {
    expect(migrateSettingsShape({themes: {current: "luxury", useSystem: false}}).appearance.accent).toBe("teal")
    expect(migrateSettingsShape({themes: {current: "lofi", useSystem: false}}).appearance.accent).toBe("teal")
  })

  it("is idempotent — leaves an already-migrated blob untouched", () => {
    const already = {appearance: {mode: "light", accent: "blue"}}
    expect(migrateSettingsShape(already)).toEqual(already)
  })

  it("passes through unrelated keys", () => {
    const out = migrateSettingsShape({themes: {current: "aurora", useSystem: false}, sync: {enabled: true}})
    expect(out.sync).toEqual({enabled: true})
  })
})
