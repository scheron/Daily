<script setup lang="ts">
import {computed, ref} from "vue"

import {toDurationLabel} from "@daily/std"

import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import EstimationPicker from "@/ui/common/pickers/EstimationPicker"
import {cn} from "@/utils/ui/tailwindcss"
import PropertyCell from "../PropertyCell.vue"

import type {Task} from "@daily/protocol"

type TimeField = "estimatedTime" | "spentTime"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()

const activeField = ref<TimeField>("estimatedTime")

const isEmpty = computed(() => props.task.estimatedTime === 0 && props.task.spentTime === 0)
const timeLabel = computed(() => {
  if (isEmpty.value) return "Set estimate"
  return `${toDurationLabel(props.task.estimatedTime, "—")} / ${toDurationLabel(props.task.spentTime, "—")}`
})

function patchTime(total: number) {
  taskEditorStore.patch({[activeField.value]: total})
}

function getTabClasses(isActive: boolean) {
  return cn(
    "flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors",
    isActive ? "bg-accent/15 text-accent" : "text-base-content/60 hover:bg-base-200 hover:text-base-content",
  )
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <PropertyCell :label="timeLabel" :is-empty="isEmpty" @click="toggle">
        <template #icon>
          <BaseIcon name="stopwatch" class="size-4" />
        </template>
      </PropertyCell>
    </template>

    <template #default>
      <div class="flex w-64 flex-col gap-2" @click.stop>
        <div class="flex items-center gap-1">
          <button type="button" :class="getTabClasses(activeField === 'estimatedTime')" @click="activeField = 'estimatedTime'">
            <BaseIcon name="stopwatch" class="size-4" />
            <span>Estimate</span>
          </button>

          <button type="button" :class="getTabClasses(activeField === 'spentTime')" @click="activeField = 'spentTime'">
            <BaseIcon name="check-check" class="size-4" />
            <span>Spent</span>
          </button>
        </div>

        <EstimationPicker :model-value="task[activeField]" @update:model-value="patchTime" />
      </div>
    </template>
  </BasePopup>
</template>
