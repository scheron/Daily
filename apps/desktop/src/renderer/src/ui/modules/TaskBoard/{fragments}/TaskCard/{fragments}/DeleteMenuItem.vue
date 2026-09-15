<script setup lang="ts">
import {useTemplateRef} from "vue"

import {useProgressFill} from "@/composables/useProgressFill"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {BaseContextMenuLabeledItem} from "@/ui/base/BaseContextMenu"
import type {HTMLAttributes} from "vue"

const props = defineProps<{item: BaseContextMenuLabeledItem}>()
const emit = defineEmits<{select: []}>()

const deleteButtonRef = useTemplateRef<HTMLButtonElement>("deleteButton")

const {isFilling} = useProgressFill(deleteButtonRef, () => emit("select"))

function getItemClasses(isFilling: boolean) {
  return cn(
    "text-base-content px-3 hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors",
    isFilling && "bg-error/10",
    props.item.disabled && "pointer-events-none opacity-50",
    props.item.class,
  )
}

function getIconClasses(classIcon: HTMLAttributes["class"]) {
  return cn("size-4.5", classIcon)
}

function getLabelClasses(classLabel: HTMLAttributes["class"]) {
  return cn("flex-1 truncate text-sm", classLabel)
}
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
    <span :class="getItemClasses(isFilling)">
      <BaseIcon v-if="item.icon" :name="item.icon" :class="getIconClasses(item.classIcon)" />
      <span :class="getLabelClasses(item.classLabel)">{{ item.label }}</span>
    </span>
  </button>
</template>
