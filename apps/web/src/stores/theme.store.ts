import {STORAGE_KEY_THEME} from "@daily/constants/persist"
import * as _themes from "@daily/constants/themes"

import {computed, ref, watch} from "vue"
import {useLocalStorage} from "@vueuse/core"
import {defineStore} from "pinia"

import type {Theme} from "@daily/types/theme"

export const useThemeStore = defineStore("theme", () => {
  const themes = ref<Theme[]>(Object.values(_themes))
  const currentThemeId = useLocalStorage(STORAGE_KEY_THEME, themes.value[8].id)

  const currentTheme = computed<Theme>(() => themes.value.find(({id}) => id === currentThemeId.value) ?? themes.value[0])

  function setTheme(themeId: Theme["id"]) {
    currentThemeId.value = themeId
  }

  function applyTheme(theme: Theme) {
    const root = document.documentElement

    root.classList.remove(...themes.value.map((t) => t.id))
    root.classList.add(theme.id)

    Object.entries(theme.colorScheme).forEach(([key, value]) => {
      root.style.setProperty(`--c-${key}`, value)
    })
  }

  watch(currentTheme, applyTheme, {immediate: true})

  return {
    currentTheme,
    themes,
    setTheme,
  }
})
