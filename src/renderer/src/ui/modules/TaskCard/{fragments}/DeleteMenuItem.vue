<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import {useProgressFill} from "@/composables/useProgressFill"
import {oklchToHex} from "@/utils/colors/oklchToHex"
import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import type {ContextMenuItem} from "@/ui/common/misc/ContextMenu"

type MenuItem = Extract<ContextMenuItem, {separator?: false}>

const props = defineProps<{item: MenuItem}>()
const emit = defineEmits<{select: []}>()

const themeStore = useThemeStore()
const deleteButtonRef = useTemplateRef<HTMLButtonElement>("deleteButton")

const {isFilling} = useProgressFill(deleteButtonRef, {
  color: computed(() => `${oklchToHex(themeStore.currentTheme.colorScheme.error)}60`),
  duration: 500,
  onComplete: () => emit("select"),
})

const itemClass = computed(() => {
  const baseClass = "text-base-content px-3 hover:bg-base-300/80 flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors"

  return cn(baseClass, isFilling.value && "bg-error/10", props.item.disabled && "pointer-events-none opacity-50", props.item.class)
})
</script>

<template>
  <button
    ref="deleteButton"
    type="button"
    :data-menu-item="item.value"
    class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent w-full rounded-md outline-none"
    :disabled="item.disabled"
    @click.prevent.stop
  >
    <span :class="itemClass">
      <BaseIcon v-if="item.icon" :name="item.icon" :class="cn(item.classIcon, 'size-4.5')" />
      <span class="flex-1 truncate text-sm" :class="item.classLabel">{{ item.label }}</span>
    </span>
  </button>
</template>
