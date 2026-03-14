<script setup lang="ts">
import {computed, onMounted, ref} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import {isDevMode} from "@/constants/env"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import AiSettings from "./{fragments}/AiSettings"
import AppearanceSettings from "./{fragments}/AppearanceSettings"
import IconsList from "./{fragments}/IconsList.vue"
import ProjectsSettings from "./{fragments}/ProjectsSettings"
import SyncSettings from "./{fragments}/SyncSettings.vue"

import type {SettingsPanel} from "@/stores/ui.store"
import type {IconName} from "@/ui/base/BaseIcon"
import type {ComponentInstance} from "vue"

type SettingsSection = {
  id: Exclude<SettingsPanel, null>
  icon: IconName
  label: string
  component: ComponentInstance<any>
}

const SECTIONS: SettingsSection[] = [
  {id: "appearance", icon: "appearance", label: "Appearance", component: AppearanceSettings},
  {id: "ai", icon: "ai", label: "AI ", component: AiSettings},
  {id: "projects", icon: "project", label: "Projects", component: ProjectsSettings},
  {id: "sync", icon: "cloud", label: "iCloud Sync", component: SyncSettings},
  ...(isDevMode ? [{id: "icons" as const, icon: "heading" as const, label: "Icons", component: IconsList}] : []),
]

useThemeStore()

const activeNav = ref<string>("appearance")

const activeSection = computed(() => SECTIONS.find((s) => s.id === activeNav.value) ?? SECTIONS[0])

onMounted(() => {
  window.BridgeIPC.send("window:ready")
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col overflow-hidden">
    <header class="h-header grid shrink-0 grid-cols-[1fr_auto_1fr] items-center justify-center">
      <div class="h-full select-none" style="-webkit-app-region: drag"></div>

      <ul class="flex items-center justify-between gap-2">
        <li v-for="section in SECTIONS" :key="section.id">
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

    <div class="flex-1 overflow-y-auto px-6">
      <div class="mx-auto max-w-2xl pt-3">
        <component :is="activeSection.component" />
      </div>
    </div>
  </div>
</template>
