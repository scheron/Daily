import {computed, ref, watch} from "vue"
import {useElectronStore} from "@/composables/useElectronStore"
import * as _themes from "@/constants/themes"
import {defineStore} from "pinia"

import type {Theme} from "@/types/theme"

export const useThemeStore = defineStore("theme", () => {
  const themes = ref<Theme[]>(Object.values(_themes))
  const currentThemeId = useElectronStore<"theme", Theme["id"]>("theme", themes.value[8].id)
  const preferredLightThemeId = useElectronStore<"preferredLightTheme", Theme["id"]>(
    "preferredLightTheme",
    themes.value.find((t) => t.type === "light")?.id || "github-light",
  )
  const preferredDarkThemeId = useElectronStore<"preferredDarkTheme", Theme["id"]>(
    "preferredDarkTheme",
    themes.value.find((t) => t.type === "dark")?.id || "github-dark",
  )
  const isSystemThemeEnabled = useElectronStore<"isSystemThemeEnabled", boolean>("isSystemThemeEnabled", false)

  const currentTheme = computed<Theme>(() => themes.value.find(({id}) => id === currentThemeId.value) ?? themes.value[0])
  const preferredLightTheme = computed<Theme>(
    () => themes.value.find(({id}) => id === preferredLightThemeId.value) ?? themes.value.find((t) => t.type === "light")!,
  )
  const preferredDarkTheme = computed<Theme>(
    () => themes.value.find(({id}) => id === preferredDarkThemeId.value) ?? themes.value.find((t) => t.type === "dark")!,
  )

  function setTheme(themeId: Theme["id"]) {
    currentThemeId.value = themeId
    isSystemThemeEnabled.value = false
  }

  function setPreferredLightTheme(themeId: Theme["id"]) {
    const theme = themes.value.find(({id}) => id === themeId)
    if (theme && theme.type === "light") {
      preferredLightThemeId.value = themeId
      if (isSystemThemeEnabled.value && !window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setTheme(themeId)
      }
    }
  }

  function setPreferredDarkTheme(themeId: Theme["id"]) {
    const theme = themes.value.find(({id}) => id === themeId)
    if (theme && theme.type === "dark") {
      preferredDarkThemeId.value = themeId
      if (isSystemThemeEnabled.value && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setTheme(themeId)
      }
    }
  }

  function applyTheme(theme: Theme) {
    const root = document.documentElement

    root.classList.remove(...themes.value.map((t) => t.id))
    root.classList.add(theme.id)

    Object.entries(theme.colorScheme).forEach(([key, value]) => {
      root.style.setProperty(`--c-${key}`, value)
    })
  }

  function toggleSystemTheme() {
    isSystemThemeEnabled.value = !isSystemThemeEnabled.value
    if (isSystemThemeEnabled.value) {
      applySystemTheme()
    }
  }

  function applySystemTheme() {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) currentThemeId.value = preferredDarkTheme.value.id
    else currentThemeId.value = preferredLightTheme.value.id
  }

  watch(currentTheme, applyTheme, {immediate: true})

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (isSystemThemeEnabled.value) applySystemTheme()
  })

  return {
    currentTheme,
    preferredLightTheme,
    preferredDarkTheme,
    themes,
    isSystemThemeEnabled,
    setTheme,
    setPreferredLightTheme,
    setPreferredDarkTheme,
    toggleSystemTheme,
  }
})
