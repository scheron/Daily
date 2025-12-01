<script setup lang="ts">
import {useVModel} from "@vueuse/core"
import {useStorageStore} from "@/stores/storage.store"

import type {SidebarSection} from "../model/types"

import BaseIcon from "@/ui/base/BaseIcon"
import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"

import {BOTTOM_MENU_ITEMS, SYNC_STATUS_ENUM} from "../model/constants"

const props = defineProps<{section: SidebarSection}>()
const emit = defineEmits<{"update:section": [section: SidebarSection]}>()

const activeSection = useVModel(props, "section", emit)
const storageStore = useStorageStore()
</script>

<template>
  <div class="border-base-300 bg-base-100 border-t px-2 py-2">
    <AnimatedTabs
      v-model:tab="activeSection"
      :tabs="BOTTOM_MENU_ITEMS"
      class="flex items-center justify-between gap-1"
      tab-class="flex items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors duration-200 outline-none focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent"
    >
      <template #tab-icon-cloud-sync>
        <BaseIcon :name="SYNC_STATUS_ENUM[storageStore.status].icon" :class="[storageStore.status === 'syncing' ? 'animate-spin' : '', 'size-5']" />
      </template>
    </AnimatedTabs>
  </div>
</template>
