import {computed, ref, watch} from "vue"
import {watchOnce} from "@vueuse/core"
import {useSettingsStore} from "@/composables/useSettingsStore"
import * as _themes from "@/constants/themes"
import {defineStore} from "pinia"

import type {Theme} from "@/types/theme"

export const useThemeStore = defineStore("theme", () => {
  const themes = ref<Theme[]>(Object.values(_themes))

  const currentThemeId = useSettingsStore("themes.current", themes.value[8].id)
  const preferredLightThemeId = useSettingsStore("themes.preferred_light", "aurora-light")
  const preferredDarkThemeId = useSettingsStore("themes.preferred_dark", "aurora")
  const isSystemThemeEnabled = useSettingsStore("themes.use_system", false)

  const currentTheme = computed<Theme>(() => themes.value.find(({id}) => id === currentThemeId.value) ?? themes.value[0])
  const preferredLightTheme = computed<Theme | null>(() => themes.value.find(({id}) => id === preferredLightThemeId.value) ?? null)
  const preferredDarkTheme = computed<Theme | null>(() => themes.value.find(({id}) => id === preferredDarkThemeId.value) ?? null)

  function setCurrentTheme(themeId: Theme["id"]) {
    currentThemeId.value = themeId
  }

  function setPreferredTheme(type: "light" | "dark", themeId: Theme["id"] | null) {
    if (!themeId) return

    const theme = themes.value.find(({id}) => id === themeId)
    if (!theme) return

    if (type === "light") {
      preferredLightThemeId.value = themeId
      if (isSystemThemeEnabled.value && !isCurrentSystemDark()) setCurrentTheme(themeId)
    } else {
      preferredDarkThemeId.value = themeId
      if (isSystemThemeEnabled.value && isCurrentSystemDark()) setCurrentTheme(themeId)
    }
  }

  function isCurrentSystemDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }

  function toggleSystemTheme(value?: boolean) {
    isSystemThemeEnabled.value = value ?? !isSystemThemeEnabled.value
    if (isSystemThemeEnabled.value) applySystemTheme()
  }

  function applySystemTheme() {
    if (isCurrentSystemDark()) setCurrentTheme(preferredDarkTheme.value?.id ?? themes.value[0].id)
    else setCurrentTheme(preferredLightTheme.value?.id ?? themes.value[0].id)
  }

  watch(
    currentTheme,
    (theme) => {
      const root = document.documentElement

      root.classList.remove(...themes.value.map((t) => t.id))
      root.classList.add(theme.id)

      Object.entries(theme.colorScheme).forEach(([key, value]) => root.style.setProperty(`--c-${key}`, value))
    },
    {immediate: true},
  )

  watchOnce(isSystemThemeEnabled, (value) => value && applySystemTheme())

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (isSystemThemeEnabled.value) applySystemTheme()
  })

  return {
    currentTheme,
    isSystemThemeEnabled,
    preferredLightTheme,
    preferredDarkTheme,
    themes,

    setCurrentTheme,
    setPreferredTheme,
    toggleSystemTheme,
  }
})
