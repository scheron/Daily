<script setup lang="ts">
import {computed, onMounted, ref} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import {useDevice} from "@/composables/useDevice"
import {isDevMode} from "@/constants/env"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import AiSettings from "@/ui/modules/Settings/{fragments}/AiSettings"
import DeletedTasks from "@/ui/modules/Settings/{fragments}/DeletedTasks"
import IconsList from "@/ui/modules/Settings/{fragments}/IconsList.vue"
import LayoutSettings from "@/ui/modules/Settings/{fragments}/LayoutSettings"
import ProjectsSettings from "@/ui/modules/Settings/{fragments}/ProjectsSettings"
import SyncSettings from "@/ui/modules/Settings/{fragments}/SyncSettings.vue"
import ThemesSettings from "@/ui/modules/Settings/{fragments}/ThemesSettings"

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
  {id: "ai", icon: "ai", label: "AI Settings", component: AiSettings},
  {id: "themes", icon: "background", label: "Themes", component: ThemesSettings},
  {id: "layout", icon: "layout", label: "Layout", component: LayoutSettings},
  {id: "projects", icon: "project", label: "Projects", component: ProjectsSettings},
  {id: "sync", icon: "cloud", label: "iCloud Sync", component: SyncSettings},
  {id: "deleted", icon: "book-x", label: "Deleted Tasks", component: DeletedTasks},
  ...(isDevMode ? [{id: "icons" as const, icon: "heading" as const, label: "Icons", component: IconsList}] : []),
]

useThemeStore()

const {isMobile, isMacOS} = useDevice()
const activeNav = ref<string>("ai")

const activeSection = computed(() => SECTIONS.find((s) => s.id === activeNav.value) ?? SECTIONS[0])

onMounted(() => {
  window.BridgeIPC.send("window:ready")
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col overflow-hidden">
    <header class="h-10 shrink-0 select-none" style="-webkit-app-region: drag" :class="{'pl-16': isMacOS}" />

    <div class="flex min-h-0 flex-1">
      <nav class="border-base-300 hide-scrollbar shrink-0 overflow-y-auto border-r pr-2 pl-4" :class="isMobile ? 'w-14' : 'w-44'">
        <ul class="space-y-1">
          <li v-for="section in SECTIONS" :key="section.id">
            <BaseButton
              v-tooltip="{content: section.label, placement: 'right'}"
              variant="ghost"
              :icon="section.icon"
              icon-class="size-4 shrink-0"
              class="flex w-full gap-2 py-1 text-sm"
              :class="[
                isMobile ? 'justify-center px-1' : 'justify-start px-2.5 text-left',
                activeNav === section.id
                  ? 'bg-accent/15 hover:bg-accent/20 text-accent font-medium'
                  : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
              ]"
              @click="activeNav = section.id"
            >
              <template v-if="!isMobile">{{ section.label }}</template>
            </BaseButton>
          </li>
        </ul>
      </nav>

      <div class="flex-1 overflow-y-auto px-6">
        <div class="mx-auto max-w-2xl pt-3">
          <h3 class="text-base-content mb-4 flex items-center gap-2 text-sm font-semibold">
            <BaseIcon :name="activeSection.icon" class="text-accent size-4" />
            {{ activeSection.label }}
          </h3>
          <component :is="activeSection.component" />
        </div>
      </div>
    </div>
  </div>
</template>
