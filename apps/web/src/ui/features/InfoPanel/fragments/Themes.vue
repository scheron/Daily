<script setup lang="ts">
import {BaseIcon} from "@daily/ui/base"

import {computed} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import ThemesPreview from "./ThemesPreview.vue"

const themeStore = useThemeStore()

const lightThemes = computed(() => themeStore.themes.filter((theme) => theme.type === "light"))
const darkThemes = computed(() => themeStore.themes.filter((theme) => theme.type === "dark"))

function setTheme(themeId: string) {
  themeStore.setTheme(themeId)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="text-base-content flex items-center gap-1 text-xs font-bold select-none">
      <BaseIcon name="sun" class="size-4" />
      Light
    </div>
    <div class="flex gap-3 overflow-x-auto overscroll-none py-3">
      <ThemesPreview
        v-for="theme in lightThemes"
        :key="theme.id"
        :theme="theme"
        :selected="theme.id === themeStore.currentTheme.id"
        @click="setTheme(theme.id)"
      />
    </div>

    <div class="text-base-content flex items-center gap-1 text-xs font-bold select-none">
      <BaseIcon name="moon" class="size-4" />
      Dark
    </div>

    <div class="flex gap-3 overflow-x-auto overscroll-none py-3">
      <ThemesPreview
        v-for="theme in darkThemes"
        :key="theme.id"
        :theme="theme"
        :selected="theme.id === themeStore.currentTheme.id"
        @click="setTheme(theme.id)"
      />
    </div>
  </div>
</template>
