<script setup lang="ts">
import {computed, ref} from "vue"

import {useDevice} from "@/composables/useDevice"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"
import Logo from "@/ui/common/misc/Logo.vue"
import AiAssistant from "@/ui/modules/AiAssistant"
import CalendarMonth from "@/ui/modules/CalendarMonth"
import SearchForm from "@/ui/modules/SearchForm"
import Settings from "@/ui/modules/Settings"
import TagsForm from "@/ui/modules/TagsForm"

import {useUIStore} from "@MainView/stores/ui.store"
import {BOTTOM_MENU_ITEMS} from "./model/constants"

import type {SidebarSection} from "./model/types"

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
        :tooltip="isDesktop ? 'Collapse Sidebar' : 'Close Sidebar'"
        style="-webkit-app-region: no-drag"
        @click="uiStore.toggleSidebarCollapse()"
      />
    </div>

    <div :style="{height: contentHeight + 'px'}" class="flex flex-col">
      <BaseSpinner v-if="!dataLoaded" />

      <template v-else>
        <div class="hide-scrollbar flex-1 overflow-y-auto">
          <CalendarMonth v-if="activeSection === 'calendar'" />
          <TagsForm v-else-if="activeSection === 'tags'" class="h-full" />
          <SearchForm v-else-if="activeSection === 'search'" class="h-full" />
          <AiAssistant v-else-if="activeSection === 'assistant'" class="h-full" />
          <Settings v-else-if="activeSection === 'settings'" class="h-full" />
        </div>

        <div class="app-sidebar-footer border-base-300 bg-base-100 border-t px-2 py-2">
          <AnimatedTabs
            v-model:tab="activeSection"
            :tabs="BOTTOM_MENU_ITEMS"
            class="flex items-center justify-between gap-1"
            tab-class="flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-200 outline-none focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent"
          />
        </div>
      </template>
    </div>
  </aside>
</template>
