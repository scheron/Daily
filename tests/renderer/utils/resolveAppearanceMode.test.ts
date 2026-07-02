import {describe, expect, it} from "vitest"

import {resolveAppearanceMode} from "@renderer/utils/theme/resolveAppearanceMode"

describe("resolveAppearanceMode", () => {
  it("returns the explicit mode unchanged", () => {
    expect(resolveAppearanceMode("light", true)).toBe("light")
    expect(resolveAppearanceMode("dark", false)).toBe("dark")
  })

  it("follows the system preference when mode is system", () => {
    expect(resolveAppearanceMode("system", true)).toBe("dark")
    expect(resolveAppearanceMode("system", false)).toBe("light")
  })
})
