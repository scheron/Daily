<script lang="ts" setup>
import {computed, HTMLAttributes} from "vue"

import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import {tagHashVariant, tagNameVariant, tagRemoveIconVariant, tagRemoveVariant, tagVariant} from "./variants"

import type {Tag} from "@shared/types/storage"
import type {TagSize} from "./variants"

const props = withDefaults(
  defineProps<{
    tag: Tag
    active?: boolean
    /** Whether the tag is selectable */
    selectable?: boolean
    /** When true, renders an inline × that emits `remove` on click. */
    removable?: boolean
    size?: TagSize
    class?: HTMLAttributes["class"]
  }>(),
  {size: "md"},
)

const emit = defineEmits<{remove: []}>()

const containerClass = computed(() => tagVariant({size: props.size}).value)
const hashClass = computed(() => tagHashVariant({size: props.size}).value)
const nameClass = computed(() => tagNameVariant({size: props.size}).value)
const removeClass = computed(() => tagRemoveVariant({size: props.size}).value)
const removeIconClass = computed(() => tagRemoveIconVariant({size: props.size}).value)

function onRemove(event: MouseEvent) {
  event.stopPropagation()
  emit("remove")
}
</script>

<template>
  <button type="button" :class="cn([containerClass, {active, selectable, removable}, props.class])" :style="{'--tag-color': tag.color}">
    <span class="leading-none" :class="hashClass">#</span>
    <span class="truncate" :class="nameClass">{{ tag.name }}</span>
    <span
      v-if="removable"
      class="base-tag__remove ml-1 inline-flex cursor-pointer items-center justify-center rounded-full"
      :class="removeClass"
      role="button"
      tabindex="0"
      aria-label="Remove tag"
      @click="onRemove"
      @keydown.enter.prevent="onRemove($event as unknown as MouseEvent)"
    >
      <BaseIcon name="x" :class="removeIconClass" />
    </span>
  </button>
</template>

<style scoped>
.base-tag {
  --tag-color: var(--color-accent);

  color: var(--tag-color);
  border: 1px solid transparent;
}

.base-tag.selectable {
  cursor: pointer;
}

.base-tag.selectable:hover {
  background: color-mix(in oklab, var(--tag-color) 22%, var(--color-base-100));
}

.base-tag.active {
  background: color-mix(in oklab, var(--tag-color) 28%, var(--color-base-100));
  border-color: color-mix(in oklab, var(--tag-color) 48%, transparent);
}

.base-tag__remove {
  color: color-mix(in oklab, var(--tag-color) 70%, transparent);
}

.base-tag__remove:hover {
  background: color-mix(in oklab, var(--tag-color) 22%, transparent);
  color: var(--tag-color);
}
</style>
