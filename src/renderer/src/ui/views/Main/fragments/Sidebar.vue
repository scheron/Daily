<script setup lang="ts">
import {computed, ref} from "vue"
import {useDevice} from "@/composables/useDevice"
import {useUIStore} from "@/stores/ui.store"

import type {SidebarSection} from "@/types/sidebar"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import Logo from "@/ui/common/misc/Logo.vue"
import CalendarMonthPanel from "@/ui/features/panels/CalendarMonthPanel"
import CloudSyncPanel from "@/ui/features/panels/CloudSyncPanel"
import HelpPanel from "@/ui/features/panels/HelpPanel"
import RecentActiveTasksPanel from "@/ui/features/panels/RecentActiveTasksPanel"
import TagsPanel from "@/ui/features/panels/TagsPanel"
import ThemesPanel from "@/ui/features/panels/ThemesPanel"

import BottomMenuBar from "./BottomMenuBar.vue"

defineProps<{
  dataLoaded: boolean
  contentHeight: number
}>()

const uiStore = useUIStore()
const {isMacOS, isDesktop} = useDevice()
const activeSection = ref<SidebarSection>("calendar")

const showCollapseButton = computed(() => {
  if (isDesktop.value) return !uiStore.isSidebarCollapsed
  return false
})
</script>

<template>
  <aside class="border-base-300 bg-base-100 w-sidebar border-r">
    <div
      class="border-base-300 h-header flex items-center border-b px-4 select-none"
      style="-webkit-app-region: drag"
      :class="{'justify-between': showCollapseButton}"
    >
      <div class="text-accent flex items-center gap-2" :class="{'pl-16': isMacOS}">
        <Logo class="h-5" />
        <h2 class="font-mono text-xl font-bold">Daily</h2>
      </div>

      <BaseButton
        v-if="showCollapseButton"
        variant="ghost"
        icon="sidebar"
        :tooltip="isDesktop ? 'Collapse Sidebar' : 'Close Sidebar'"
        style="-webkit-app-region: no-drag"
        @click="uiStore.toggleSidebarCollapse()"
      />
    </div>

    <div :style="{height: contentHeight + 'px'}" class="flex flex-col">
      <BaseSpinner v-if="!dataLoaded" />

      <template v-else>
        <div class="hide-scrollbar flex-1 overflow-y-auto">
          <div v-if="activeSection === 'calendar'" class="flex h-full flex-col gap-2 px-2 py-2">
            <CalendarMonthPanel />
            <RecentActiveTasksPanel />
          </div>
          <TagsPanel v-else-if="activeSection === 'tags'" class="h-full" />
          <CloudSyncPanel v-else-if="activeSection === 'cloud-sync'" class="h-full" />
          <ThemesPanel v-else-if="activeSection === 'themes'" class="h-full px-4 py-4" />
          <HelpPanel v-else-if="activeSection === 'help'" class="h-full px-4" />
        </div>

        <BottomMenuBar v-model:section="activeSection" />
      </template>
    </div>
  </aside>
</template>
