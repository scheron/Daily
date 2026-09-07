<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {findStatusAction, STATUS_ACTIONS, STATUS_COLOR_CLASS, statusOptionClass} from "@/constants/taskStatus"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {TaskStatus} from "@daily/protocol"

const props = withDefaults(
  defineProps<{
    /** Which side of the trigger the menu opens from. */
    position?: "start" | "end"
    /** Extra classes for the popup container, for call sites that need a narrower menu. */
    containerClass?: string
  }>(),
  {position: "start", containerClass: "min-w-36 p-1"},
)

const model = defineModel<TaskStatus>({required: true})

const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

const current = computed(() => findStatusAction(model.value))

function optionClass(status: TaskStatus) {
  return statusOptionClass(status, model.value)
}

function select(status: TaskStatus) {
  popupRef.value?.hide()
  if (status !== model.value) model.value = status
}
</script>

<template>
  <BasePopup ref="popup" hide-header :position="props.position" :container-class="props.containerClass" content-class="gap-0.5">
    <template #trigger="{toggle}">
      <slot name="trigger" :toggle="toggle" :current="current" :color-class="STATUS_COLOR_CLASS[model]" />
    </template>

    <template #default>
      <BaseButton
        v-for="option in STATUS_ACTIONS"
        :key="option.value"
        variant="ghost"
        size="sm"
        class="w-full justify-start gap-2 px-2 py-1 text-left"
        :class="optionClass(option.value)"
        :tooltip="option.tooltip"
        @click.stop="select(option.value)"
      >
        <BaseIcon :name="option.icon" class="size-4 shrink-0" />
        <span class="text-sm uppercase tracking-wide">{{ option.label }}</span>
      </BaseButton>
    </template>
  </BasePopup>
</template>
