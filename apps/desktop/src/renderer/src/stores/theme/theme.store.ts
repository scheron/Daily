import {computed, ref, watch} from "vue"
import {useBroadcastChannel} from "@vueuse/core"
import {defineStore} from "pinia"

import {ACCENT_PRESETS, BASE_PRESETS, DEFAULT_ACCENT_ID, DEFAULT_BASE_ID} from "@daily/protocol"

import {useSettingValue} from "@/composables/useSettingValue"
import {resolveAppearanceMode} from "./utils/resolveAppearanceMode"

import type {AppearanceMode, BasePalette, BasePreset, FontSize} from "@daily/protocol"

type AppearanceSnapshot = {
  isDark: boolean
  accent: string
  base: BasePalette
  fontSize: FontSize
}

export const useThemeStore = defineStore("theme", () => {
  const isSystemDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches)

  const mode = useSettingValue<"appearance.mode", AppearanceMode>("appearance.mode", "system")
  const accentId = useSettingValue("appearance.accent", DEFAULT_ACCENT_ID)
  const baseId = useSettingValue("appearance.base", DEFAULT_BASE_ID)
  const fontSize = useSettingValue<"typography.fontSize", FontSize>("typography.fontSize", "normal")

  const resolvedMode = computed(() => resolveAppearanceMode(mode.value, isSystemDark.value))
  const accentValue = computed(() => resolveAccentValue(accentId.value))

  const basePalette = computed(() => {
    const preset = resolveBasePreset(baseId.value)
    return resolvedMode.value === "dark" ? preset.dark : preset.light
  })

  const {data: broadcast, post} = useBroadcastChannel<AppearanceSnapshot | null, AppearanceSnapshot | null>({
    name: "daily-theme-sync",
  })

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    isSystemDark.value = event.matches
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
    const fontSizePx: Record<FontSize, number> = {small: 13, normal: 15, large: 17}
    const root = document.documentElement
    root.classList.toggle("dark", snapshot.isDark)
    root.style.setProperty("--c-accent", snapshot.accent)
    root.style.setProperty("--c-base-100", snapshot.base.base100)
    root.style.setProperty("--c-base-200", snapshot.base.base200)
    root.style.setProperty("--c-base-300", snapshot.base.base300)
    root.style.setProperty("--c-base-content", snapshot.base.content)
    root.style.setProperty("--app-font-size", `${fontSizePx[snapshot.fontSize]}px`)
  }

  function resolveAccentValue(id: string): string {
    const preset = ACCENT_PRESETS.find((p) => p.id === id)
    if (preset) return preset.value
    return ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!.value
  }

  function resolveBasePreset(id: string): BasePreset {
    const preset = BASE_PRESETS.find((p) => p.id === id)
    if (preset) return preset
    return BASE_PRESETS.find((p) => p.id === DEFAULT_BASE_ID)!
  }

  watch(
    [resolvedMode, accentValue, basePalette, fontSize],
    () => {
      const snapshot: AppearanceSnapshot = {
        isDark: resolvedMode.value === "dark",
        accent: accentValue.value,
        base: basePalette.value,
        fontSize: fontSize.value,
      }
      applySnapshot(snapshot)
      post(snapshot)
    },
    {immediate: true},
  )

  watch(broadcast, (snapshot) => snapshot && applySnapshot(snapshot))

  return {
    mode,
    accentId,
    baseId,
    fontSize,

    setMode,
    setAccent,
    setBase,
  }
})
