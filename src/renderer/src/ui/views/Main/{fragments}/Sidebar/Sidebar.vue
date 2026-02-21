<script setup lang="ts">
import {computed} from "vue"

import {useUIStore} from "@/stores/ui.store"
import {useDevice} from "@/composables/useDevice"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"
import Logo from "@/ui/common/misc/Logo.vue"
import AiAssistant from "@/ui/modules/AiAssistant"
import CalendarMonth from "@/ui/modules/CalendarMonth"
import SearchForm from "@/ui/modules/SearchForm"
import Settings from "@/ui/modules/Settings"
import TagsForm from "@/ui/modules/TagsForm"

import {BOTTOM_MENU_ITEMS} from "./model/constants"

defineProps<{
  dataLoaded: boolean
  contentHeight: number
}>()

const uiStore = useUIStore()

const {isMacOS, isDesktop} = useDevice()

const showCollapseButton = computed(() => {
  if (isDesktop.value) return !uiStore.isSidebarCollapsed
  return false
})
</script>

<template>
  <aside class="app-sidebar border-base-300 bg-base-100 w-sidebar border-r">
    <div
      class="app-header border-base-300 h-header flex items-center border-b px-4 select-none"
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
        :tooltip="isDesktop ? `Collapse (${toShortcutKeys('ui:toggle-sidebar')})` : 'Close'"
        style="-webkit-app-region: no-drag"
        @click="uiStore.toggleSidebarCollapse()"
      />
    </div>

    <div :style="{height: contentHeight + 'px'}" class="flex flex-col">
      <BaseSpinner v-if="!dataLoaded" />

      <template v-else>
        <div class="hide-scrollbar flex-1 overflow-y-auto">
          <CalendarMonth v-if="uiStore.activeSidebarSection === 'calendar'" />
          <TagsForm v-else-if="uiStore.activeSidebarSection === 'tags'" class="h-full" />
          <SearchForm v-else-if="uiStore.activeSidebarSection === 'search'" class="h-full" />
          <AiAssistant
            v-else-if="uiStore.activeSidebarSection === 'assistant'"
            class="h-full"
            @navigate-settings="uiStore.setActiveSidebarSection('settings')"
          />
          <Settings v-else-if="uiStore.activeSidebarSection === 'settings'" class="h-full" />
        </div>

        <div class="app-sidebar-footer border-base-300 bg-base-100 border-t px-2 py-2">
          <AnimatedTabs
            v-model:tab="uiStore.activeSidebarSection"
            :tabs="BOTTOM_MENU_ITEMS"
            class="flex items-center justify-between gap-1"
            tab-class="flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-200 outline-none focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent"
          />
        </div>
      </template>
    </div>
  </aside>
</template>
