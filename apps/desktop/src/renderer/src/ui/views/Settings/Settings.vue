<script setup lang="ts">
import {onMounted} from "vue"

import {useThemeStore} from "@/stores/theme"
import BaseButton from "@/ui/base/BaseButton"
import {useSettingsNav} from "./useSettingsNav"

useThemeStore()

const {sections, activeNav, activeSection} = useSettingsNav()

function getSectionVariant(isActive: boolean) {
  return isActive ? "primary" : "ghost-muted"
}

onMounted(() => {
  window.BridgeIPC.send("window:ready")
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col overflow-hidden">
    <header class="h-header grid shrink-0 grid-cols-[1fr_auto_1fr] items-center justify-center">
      <div class="h-full select-none" style="-webkit-app-region: drag"></div>

      <ul class="flex items-center justify-between gap-2">
        <li v-for="section in sections" :key="section.id">
          <BaseButton
            :variant="getSectionVariant(activeNav === section.id)"
            :icon="section.icon"
            size="sm"
            class="w-full"
            @click="activeNav = section.id"
          >
            {{ section.label }}
          </BaseButton>
        </li>
      </ul>

      <div class="h-full select-none" style="-webkit-app-region: drag"></div>
    </header>

    <div class="h-[calc(100vh-var(--header-height))] flex-1 overflow-auto px-6">
      <div class="mx-auto flex h-full max-w-2xl flex-col pt-3 pb-12">
        <component :is="activeSection.component" />
      </div>
    </div>
  </div>
</template>
