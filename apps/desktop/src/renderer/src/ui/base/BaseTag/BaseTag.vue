<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {tagHashVariant, tagNameVariant, tagRemoveIconVariant, tagRemoveVariant, tagVariant} from "./variants"

import type {Tag} from "@daily/protocol"
import type {HTMLAttributes} from "vue"
import type {TagSize} from "./variants"

const props = withDefaults(
  defineProps<{
    tag: Tag
    active?: boolean
    selectable?: boolean
    removable?: boolean
    size?: TagSize
    class?: HTMLAttributes["class"]
  }>(),
  {size: "md"},
)

const emit = defineEmits<{remove: []}>()

const containerClass = tagVariant(props)
const hashClass = tagHashVariant(props)
const nameClass = tagNameVariant(props)
const removeClass = tagRemoveVariant(props)
const removeIconClass = tagRemoveIconVariant(props)

function getTagClasses() {
  return cn(containerClass.value, props.active && "active", props.selectable && "selectable", props.removable && "removable", props.class)
}

function onRemove(event: MouseEvent) {
  event.stopPropagation()
  emit("remove")
}
</script>

<template>
  <button type="button" :class="getTagClasses()" :style="{'--tag-color': tag.color}">
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
