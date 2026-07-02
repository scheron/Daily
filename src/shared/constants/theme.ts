export type AccentPreset = {
  id: string
  name: string
  value: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {id: "teal", name: "Teal", value: "oklch(72% 0.17 190)"},
  {id: "blue", name: "Blue", value: "oklch(68% 0.16 245)"},
  {id: "indigo", name: "Indigo", value: "oklch(62% 0.18 280)"},
  {id: "purple", name: "Purple", value: "oklch(62% 0.2 310)"},
  {id: "pink", name: "Pink", value: "oklch(68% 0.21 350)"},
  {id: "red", name: "Red", value: "oklch(64% 0.2 20)"},
  {id: "orange", name: "Orange", value: "oklch(70% 0.17 50)"},
  {id: "amber", name: "Amber", value: "oklch(75% 0.14 85)"},
  {id: "lime", name: "Lime", value: "oklch(80% 0.18 130)"},
  {id: "green", name: "Green", value: "oklch(70% 0.17 150)"},
]

export const DEFAULT_ACCENT_ID = "teal"

/**
 * Resolves an accent preset id to its OKLCH value.
 * Falls back to the default preset when the id is unknown.
 * @example resolveAccentValue("blue") // "oklch(68% 0.16 245)"
 */
export function resolveAccentValue(id: string): string {
  const preset = ACCENT_PRESETS.find((p) => p.id === id)
  if (preset) return preset.value
  return ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!.value
}
