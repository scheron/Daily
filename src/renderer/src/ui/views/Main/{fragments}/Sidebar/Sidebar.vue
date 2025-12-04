<script setup lang="ts">
import {computed, ref} from "vue"

import {useStorageStore} from "@/stores/storage.store"
import {useDevice} from "@/composables/useDevice"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"
import Logo from "@/ui/common/misc/Logo.vue"

import {useUIStore} from "@MainView/stores/ui.store"
import CalendarMonthPanel from "./{fragments}/CalendarMonthPanel.vue"
import CloudSyncPanel from "./{fragments}/CloudSyncPanel.vue"
import HelpPanel from "./{fragments}/HelpPanel"
import RecentActiveTasksPanel from "./{fragments}/RecentActiveTasksPanel.vue"
import SearchPanel from "./{fragments}/SearchPanel"
import TagsPanel from "./{fragments}/TagsPanel"
import ThemesPanel from "./{fragments}/ThemesPanel"
import {BOTTOM_MENU_ITEMS, SYNC_STATUS_ENUM} from "./constants"
import {SidebarSection} from "./types"

defineProps<{
  dataLoaded: boolean
  contentHeight: number
}>()

const uiStore = useUIStore()
const storageStore = useStorageStore()

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
          <SearchPanel v-else-if="activeSection === 'search'" class="h-full" />
          <ThemesPanel v-else-if="activeSection === 'themes'" class="h-full px-4 py-4" />
          <HelpPanel v-else-if="activeSection === 'help'" class="h-full px-4" />
        </div>

        <div class="border-base-300 bg-base-100 border-t px-2 py-2">
          <AnimatedTabs
            v-model:tab="activeSection"
            :tabs="BOTTOM_MENU_ITEMS"
            class="flex items-center justify-between gap-1"
            tab-class="flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-200 outline-none focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent"
          >
            <template #tab-icon-cloud-sync>
              <BaseIcon
                :name="SYNC_STATUS_ENUM[storageStore.status].icon"
                :class="[storageStore.status === 'syncing' ? 'animate-spin' : '', 'size-5']"
              />
            </template>
          </AnimatedTabs>
        </div>
      </template>
    </div>
  </aside>
</template>
