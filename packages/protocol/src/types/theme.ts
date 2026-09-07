export type TagPresetColor = {
  name: string
  value: string
}

export type AccentPreset = {
  id: string
  name: string
  value: string
}

export type BasePalette = {
  base100: string
  base200: string
  base300: string
  content: string
}

export type BasePreset = {
  id: string
  name: string
  light: BasePalette
  dark: BasePalette
}
