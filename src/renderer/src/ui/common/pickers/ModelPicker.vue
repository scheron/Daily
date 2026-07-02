<script setup lang="ts">
import {computed, HTMLAttributes, ref} from "vue"

import {cn} from "@/utils/ui/tailwindcss"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {BaseMenuItem} from "@/ui/base/BaseMenu.vue"

const props = defineProps<{
  /** Currently selected model id. */
  modelValue: string
  /** Available model ids to choose from. */
  options: string[]
  placeholder?: string
  triggerClass?: HTMLAttributes["class"]
}>()

const emit = defineEmits<{"update:modelValue": [string]}>()

const popupRef = ref<InstanceType<typeof BasePopup> | null>(null)

const items = computed<BaseMenuItem[]>(() =>
  props.options.map((option) => ({
    value: option,
    label: option,
    ...(option === props.modelValue ? {classLabel: "text-accent"} : {}),
  })),
)

const triggerClass = computed(() =>
  cn("border-base-300 hover:border-base-content/20 flex w-48 justify-between gap-2 rounded-lg border px-2 py-1.5", props.triggerClass),
)

function onSelect(value: BaseMenuItem["value"] | null) {
  popupRef.value?.hide()
  if (!value || value === props.modelValue) return
  emit("update:modelValue", value as string)
}
</script>

<template>
  <BasePopup ref="popupRef" hide-header position="end" trigger-class="min-w-0">
    <template #trigger="{toggle}">
      <BaseButton variant="ghost" :class="triggerClass" @click="toggle">
        <span class="truncate text-left text-sm">{{ modelValue || placeholder || "Select model" }}</span>
        <BaseIcon name="chevron-up-down" class="text-base-content/40 size-3.5 shrink-0" />
      </BaseButton>
    </template>

    <BaseMenu :items="items" @select="onSelect" />
  </BasePopup>
</template>
