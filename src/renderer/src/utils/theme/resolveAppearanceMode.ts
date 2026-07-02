import type {AppearanceMode} from "@shared/types/storage"

/**
 * Resolves an appearance mode to a concrete light/dark value.
 * @param mode The user-selected mode.
 * @param systemPrefersDark Whether the OS currently prefers dark.
 * @example resolveAppearanceMode("system", true) // "dark"
 */
export function resolveAppearanceMode(mode: AppearanceMode, systemPrefersDark: boolean): "light" | "dark" {
  if (mode === "system") return systemPrefersDark ? "dark" : "light"
  return mode
}
