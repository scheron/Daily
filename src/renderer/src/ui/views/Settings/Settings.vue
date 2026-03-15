<script setup lang="ts">
import {onMounted} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import BaseButton from "@/ui/base/BaseButton.vue"

import {useSettingsNav} from "./model/useSettingsNav"

useThemeStore()

const {sections, activeNav, activeSection} = useSettingsNav()

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
            v-tooltip="{content: section.label, placement: 'bottom'}"
            variant="ghost"
            :icon="section.icon"
            icon-class="size-4 shrink-0"
            class="flex w-full gap-2 px-1 py-0.5 text-sm"
            :class="[
              activeNav === section.id
                ? 'bg-accent/15 hover:bg-accent/20 text-accent'
                : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
            ]"
            @click="activeNav = section.id"
          >
            {{ section.label }}
          </BaseButton>
        </li>
      </ul>

      <div class="h-full select-none" style="-webkit-app-region: drag"></div>
    </header>

    <div class="h-[calc(100vh-var(--header-height))] flex-1 overflow-auto px-6">
      <div class="mx-auto flex h-full max-w-2xl flex-col py-3">
        <component :is="activeSection.component" />
      </div>
    </div>
  </div>
</template>
