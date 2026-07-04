import {computed, ref, watch} from "vue"
import {useBroadcastChannel} from "@vueuse/core"
import {defineStore} from "pinia"

import {ACCENT_PRESETS, BASE_PRESETS, DEFAULT_ACCENT_ID, DEFAULT_BASE_ID} from "@shared/constants/theme"
import {useSettingValue} from "@/composables/useSettingsValue"
import {BROADCAST_CHANNELS} from "@/constants/events"
import {resolveAppearanceMode} from "@/utils/theme/resolveAppearanceMode"

import type {AppearanceMode} from "@shared/types/storage"
import type {BasePalette, BasePreset} from "@shared/types/theme"

type AppearanceSnapshot = {
  isDark: boolean
  accent: string
  base: BasePalette
}

export const useThemeStore = defineStore("theme", () => {
  const {data: broadcast, post} = useBroadcastChannel<AppearanceSnapshot | null, AppearanceSnapshot | null>({
    name: BROADCAST_CHANNELS.THEME_SYNC,
  })

  const mode = useSettingValue<"appearance.mode", AppearanceMode>("appearance.mode", "system")
  const accentId = useSettingValue("appearance.accent", DEFAULT_ACCENT_ID)
  const baseId = useSettingValue("appearance.base", DEFAULT_BASE_ID)

  const systemPrefersDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches)

  const resolvedMode = computed(() => resolveAppearanceMode(mode.value, systemPrefersDark.value))
  const accentValue = computed(() => resolveAccentValue(accentId.value))

  const basePalette = computed(() => {
    const preset = resolveBasePreset(baseId.value)
    return resolvedMode.value === "dark" ? preset.dark : preset.light
  })

  function setMode(value: AppearanceMode) {
    mode.value = value
  }

  function setAccent(id: string) {
    accentId.value = id
  }

  function setBase(id: string) {
    baseId.value = id
  }

  function applySnapshot(snapshot: AppearanceSnapshot) {
    const root = document.documentElement
    root.classList.toggle("dark", snapshot.isDark)
    root.style.setProperty("--c-accent", snapshot.accent)
    root.style.setProperty("--c-base-100", snapshot.base.base100)
    root.style.setProperty("--c-base-200", snapshot.base.base200)
    root.style.setProperty("--c-base-300", snapshot.base.base300)
    root.style.setProperty("--c-base-content", snapshot.base.content)
  }

  /**
   * Resolves an accent preset id to its OKLCH value.
   * Falls back to the default preset when the id is unknown.
   * @example resolveAccentValue("blue") // "oklch(68% 0.16 245)"
   */
  function resolveAccentValue(id: string): string {
    const preset = ACCENT_PRESETS.find((p) => p.id === id)
    if (preset) return preset.value
    return ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!.value
  }

  /**
   * Resolves a base preset id to its full preset.
   * Falls back to the default preset when the id is unknown.
   * @example resolveBasePreset("warm").light.base100 // "oklch(98% 0.01 70)"
   */
  function resolveBasePreset(id: string): BasePreset {
    const preset = BASE_PRESETS.find((p) => p.id === id)
    if (preset) return preset
    return BASE_PRESETS.find((p) => p.id === DEFAULT_BASE_ID)!
  }

  watch(
    [resolvedMode, accentValue, basePalette],
    () => {
      const snapshot: AppearanceSnapshot = {
        isDark: resolvedMode.value === "dark",
        accent: accentValue.value,
        base: basePalette.value,
      }
      applySnapshot(snapshot)
      post(snapshot)
    },
    {immediate: true},
  )

  watch(broadcast, (snapshot) => snapshot && applySnapshot(snapshot))

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    systemPrefersDark.value = event.matches
  })

  return {
    mode,
    accentId,
    accentValue,
    baseId,
    resolvedMode,

    setMode,
    setAccent,
    setBase,
  }
})
