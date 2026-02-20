<script setup lang="ts">
import {computed} from "vue"

import {useUIStore} from "@/stores/ui.store"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import BlockUI from "@/ui/common/misc/BlockUI.vue"

import LayoutPreview from "./LayoutPreview.vue"

import type {LayoutType} from "@shared/types/storage"

const uiStore = useUIStore()

const layoutOptions = computed<{label: string; value: LayoutType}[]>(() => [
  {label: "List", value: "list"},
  {label: "Board", value: "columns"},
])

function onSelectLayout(type: LayoutType) {
  uiStore.setTasksViewMode(type)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <LayoutPreview
        v-for="option in layoutOptions"
        :key="option.value"
        :type="option.value"
        :label="option.label"
        :selected="uiStore.tasksViewMode === option.value"
        @click="onSelectLayout(option.value)"
      />
    </div>

    <BlockUI :block="uiStore.tasksViewMode !== 'columns'">
      <div class="flex flex-col gap-2">
        <div class="border-base-300 bg-base-200/60 flex items-start justify-between gap-2 rounded-lg border p-3">
          <div>
            <p class="text-base-content text-sm">Auto-hide empty columns</p>
            <p class="text-base-content/60 text-xs">Hide columns that have no tasks</p>
          </div>
          <BaseSwitch :model-value="uiStore.columnsHideEmpty" @update:model-value="uiStore.toggleColumnsHideEmpty($event)" />
        </div>

        <div class="border-base-300 bg-base-200/60 flex items-start justify-between gap-2 rounded-lg border p-3">
          <div>
            <p class="text-base-content text-sm">Auto-collapse empty columns</p>
            <p class="text-base-content/60 text-xs">Collapse columns that have no tasks</p>
          </div>
          <BaseSwitch :model-value="uiStore.columnsAutoCollapseEmpty" @update:model-value="uiStore.toggleColumnsAutoCollapseEmpty($event)" />
        </div>
      </div>
    </BlockUI>
  </div>
</template>
