<script setup lang="ts">
import {computed, ref} from "vue"

import {WIDGET_DEFS} from "@/constants/widgets"
import {cn} from "@/utils/ui/tailwindcss"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {WidgetId} from "@/types/widgets"
import type {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import type {HTMLAttributes} from "vue"

const props = defineProps<{
  /** Currently selected widget. */
  modelValue: WidgetId
  /** Forwarded to the trigger wrapper (e.g. `flex-1`). */
  class?: HTMLAttributes["class"]
}>()

const emit = defineEmits<{"update:modelValue": [WidgetId]}>()

const popupRef = ref<InstanceType<typeof BasePopup> | null>(null)

const current = computed(() => WIDGET_DEFS[props.modelValue])

const items = computed<BaseMenuItem[]>(() =>
  Object.values(WIDGET_DEFS).map((widget) => {
    const isCurrent = widget.id === props.modelValue
    return {
      value: widget.id,
      label: widget.name,
      icon: widget.icon,
      ...(isCurrent ? {classIcon: "text-accent", classLabel: "text-accent"} : {}),
    }
  }),
)

function onSelect(value: BaseMenuItem["value"] | null) {
  popupRef.value?.hide()
  if (!value || value === props.modelValue) return
  emit("update:modelValue", value as WidgetId)
}
</script>

<template>
  <BasePopup ref="popupRef" hide-header position="start" :trigger-class="cn('min-w-0', props.class)">
    <template #trigger="{toggle}">
      <BaseButton
        variant="ghost"
        class="border-base-300 hover:border-base-content/20 w-full justify-between gap-2 rounded-lg border px-2 py-1.5"
        @click="toggle"
      >
        <span class="flex min-w-0 items-center gap-2">
          <BaseIcon :name="current.icon" class="text-base-content/50 size-3.5 shrink-0" />
          <span class="truncate text-left text-sm">{{ current.name }}</span>
        </span>
        <BaseIcon name="chevron-up-down" class="text-base-content/40 size-3.5 shrink-0" />
      </BaseButton>
    </template>

    <BaseMenu :items="items" @select="onSelect" />
  </BasePopup>
</template>
