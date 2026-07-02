<script setup lang="ts">
import {computed} from "vue"

import {toDurationLabel} from "@shared/utils/date/formatters"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import EstimationPicker from "@/ui/common/pickers/EstimationPicker.vue"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Task} from "@shared/types/storage"

const props = withDefaults(
  defineProps<{
    task: Task
    field: "estimatedTime" | "spentTime"
    placeholder?: string
  }>(),
  {
    placeholder: "—",
  },
)

const taskEditorStore = useTaskEditorStore()

const value = computed(() => props.task[props.field])
const displayLabel = computed(() => (value.value > 0 ? toDurationLabel(value.value) : props.placeholder))
const icon = computed<IconName>(() => (props.field === "estimatedTime" ? "stopwatch" : "check-check"))
const disabled = computed(() => props.field === "spentTime" && props.task.estimatedTime === 0)

function onUpdate(total: number) {
  taskEditorStore.patch({[props.field]: total})
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <BaseButton
        type="button"
        class="inline-flex items-center justify-start gap-1 p-0"
        size="sm"
        variant="text"
        :disabled="disabled"
        @click.stop="toggle"
      >
        <BaseIcon :name="icon" class="size-3.5" />
        <span class="leading-none">{{ displayLabel }}</span>
      </BaseButton>
    </template>

    <template #default>
      <EstimationPicker :model-value="value" placeholder="Select time" @update:model-value="onUpdate" />
    </template>
  </BasePopup>
</template>
