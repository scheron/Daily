<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {useProgressFill} from "@/composables/useProgressFill"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {BaseContextMenuLabeledItem} from "@/ui/base/BaseContextMenu"

const props = defineProps<{item: BaseContextMenuLabeledItem}>()
const emit = defineEmits<{select: []}>()

const deleteButtonRef = useTemplateRef<HTMLButtonElement>("deleteButton")

const {isFilling} = useProgressFill(deleteButtonRef, () => emit("select"))

const itemClass = computed(() =>
  cn(
    "text-base-content px-3 hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors",
    {"bg-error/10": isFilling.value, "pointer-events-none opacity-50": props.item.disabled},
    props.item.class,
  ),
)
const iconClass = computed(() => cn("size-4.5", props.item.classIcon))
const labelClass = computed(() => cn("flex-1 truncate text-sm", props.item.classLabel))
</script>

<template>
  <button
    ref="deleteButton"
    type="button"
    :data-menu-item="item.value"
    class="focus-visible-accent w-full rounded-md outline-none"
    :disabled="item.disabled"
    @click.prevent.stop
  >
    <span :class="itemClass">
      <BaseIcon v-if="item.icon" :name="item.icon" :class="iconClass" />
      <span :class="labelClass">{{ item.label }}</span>
    </span>
  </button>
</template>
