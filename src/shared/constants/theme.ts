import type {AccentPreset, BasePreset} from "../types/theme"

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

export const BASE_PRESETS: BasePreset[] = [
  {
    id: "cool",
    name: "Cool",
    light: {
      base100: "oklch(98% 0.01 265.754)",
      base200: "oklch(95% 0.01 265.754)",
      base300: "oklch(92% 0.01 265.754)",
      content: "oklch(20% 0.02 265.754)",
    },
    dark: {
      base100: "oklch(15% 0.02 265)",
      base200: "oklch(18% 0.02 265)",
      base300: "oklch(22% 0.02 265)",
      content: "oklch(85% 0.01 265)",
    },
  },
  {
    id: "neutral",
    name: "Neutral",
    light: {
      base100: "oklch(98% 0 0)",
      base200: "oklch(95% 0 0)",
      base300: "oklch(92% 0 0)",
      content: "oklch(20% 0 0)",
    },
    dark: {
      base100: "oklch(15% 0 0)",
      base200: "oklch(18% 0 0)",
      base300: "oklch(22% 0 0)",
      content: "oklch(85% 0 0)",
    },
  },
  {
    id: "warm",
    name: "Warm",
    light: {
      base100: "oklch(98% 0.01 70)",
      base200: "oklch(95% 0.01 70)",
      base300: "oklch(92% 0.01 70)",
      content: "oklch(20% 0.02 70)",
    },
    dark: {
      base100: "oklch(15% 0.02 70)",
      base200: "oklch(18% 0.02 70)",
      base300: "oklch(22% 0.02 70)",
      content: "oklch(85% 0.01 70)",
    },
  },
  {
    id: "green",
    name: "Green",
    light: {
      base100: "oklch(98% 0.01 160)",
      base200: "oklch(95% 0.01 160)",
      base300: "oklch(92% 0.01 160)",
      content: "oklch(20% 0.02 160)",
    },
    dark: {
      base100: "oklch(15% 0.02 160)",
      base200: "oklch(18% 0.02 160)",
      base300: "oklch(22% 0.02 160)",
      content: "oklch(85% 0.01 160)",
    },
  },
  {
    id: "stone",
    name: "Stone",
    light: {
      base100: "oklch(99.4% 0.001 106.5)",
      base200: "oklch(96% 0.002 106.5)",
      base300: "oklch(93% 0.002 106.5)",
      content: "oklch(20% 0.004 106.5)",
    },
    dark: {
      base100: "oklch(20% 0.058 106.5)",
      base200: "oklch(23% 0.058 106.5)",
      base300: "oklch(27% 0.058 106.5)",
      content: "oklch(85% 0.002 106.5)",
    },
  },
]

export const DEFAULT_ACCENT_ID = ACCENT_PRESETS[0].id
export const DEFAULT_BASE_ID = BASE_PRESETS[0].id
