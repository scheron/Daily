<script setup lang="ts">
import {computed, ref} from "vue"

import {toDurationLabel} from "@daily/std"

import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import EstimationPicker from "@/ui/common/pickers/EstimationPicker"
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

function getTabVariant(isActive: boolean) {
  return isActive ? "primary" : "ghost-muted"
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
          <BaseButton
            :variant="getTabVariant(activeField === 'estimatedTime')"
            icon="stopwatch"
            size="sm"
            class="flex-1"
            @click="activeField = 'estimatedTime'"
          >
            Estimate
          </BaseButton>

          <BaseButton
            :variant="getTabVariant(activeField === 'spentTime')"
            icon="check-check"
            size="sm"
            class="flex-1"
            @click="activeField = 'spentTime'"
          >
            Spent
          </BaseButton>
        </div>

        <EstimationPicker :model-value="task[activeField]" @update:model-value="patchTime" />
      </div>
    </template>
  </BasePopup>
</template>
