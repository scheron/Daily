<script setup lang="ts" generic="T extends string">
import {computed, useTemplateRef} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {IconName} from "@/ui/base/BaseIcon"
import type {BaseMenuItem} from "@/ui/base/BaseMenu.vue"

const props = defineProps<{
  /** Selectable views, rendered as a column-heading trigger with a dropdown menu. */
  options: {value: T; label: string; icon: IconName}[]
}>()

const model = defineModel<T>({required: true})

const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

const current = computed(() => props.options.find((option) => option.value === model.value) ?? props.options[0])

const items = computed<BaseMenuItem[]>(() =>
  props.options.map((option) => ({
    value: option.value,
    label: option.label,
    icon: option.icon,
    ...(option.value === model.value ? {classIcon: "text-accent", classLabel: "text-accent"} : {}),
  })),
)

function onSelect(value: BaseMenuItem["value"] | null) {
  popupRef.value?.hide()
  if (!value || value === model.value) return
  model.value = value as T
}
</script>

<template>
  <BasePopup ref="popup" hide-header position="start" trigger-class="min-w-0">
    <template #trigger="{toggle}">
      <button
        type="button"
        class="focus-visible-accent hover:bg-base-200 hover:text-base-content text-base-content/80 -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors"
        @click="toggle"
      >
        <BaseIcon :name="current.icon" class="size-4" />
        <span class="truncate text-sm font-medium uppercase tracking-wide">{{ current.label }}</span>
        <BaseIcon name="chevron-up-down" class="text-base-content/40 group-hover:text-base-content/70 size-3.5 shrink-0 transition-colors" />
      </button>
    </template>

    <BaseMenu :items="items" @select="onSelect" />
  </BasePopup>
</template>
