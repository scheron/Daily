import type {AppearanceMode} from "@daily/protocol"

export function resolveAppearanceMode(mode: AppearanceMode, systemPrefersDark: boolean): "light" | "dark" {
  if (mode === "system") return systemPrefersDark ? "dark" : "light"
  return mode
}
