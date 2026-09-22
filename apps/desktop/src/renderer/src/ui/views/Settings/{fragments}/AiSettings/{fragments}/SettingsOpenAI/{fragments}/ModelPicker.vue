<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {BaseMenuItem} from "@/ui/base/BaseMenu.vue"

const props = defineProps<{modelValue: string; options: string[]}>()

const emit = defineEmits<{"update:modelValue": [string]}>()

const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

const items = computed<BaseMenuItem[]>(() =>
  props.options.map((option) => ({
    value: option,
    label: option,
    ...(option === props.modelValue ? {classLabel: "text-accent"} : {}),
  })),
)

function onSelect(value: BaseMenuItem["value"]) {
  popupRef.value?.hide()
  if (!value || value === props.modelValue) return
  emit("update:modelValue", value as string)
}
</script>

<template>
  <BasePopup ref="popup" hide-header position="end" trigger-class="min-w-0">
    <template #trigger="{toggle}">
      <BaseButton variant="select" class="w-52" @click="toggle">
        <span class="truncate text-left text-sm">{{ modelValue || "Select model" }}</span>
        <BaseIcon name="chevron-up-down" class="text-base-content/40 size-3.5 shrink-0" />
      </BaseButton>
    </template>

    <BaseMenu :items="items" @select="onSelect" />
  </BasePopup>
</template>
