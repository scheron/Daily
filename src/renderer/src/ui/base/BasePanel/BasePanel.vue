<script setup lang="ts">
import {computed, ref} from "vue"

import type {IconName} from "../BaseIcon/IconsSprite.vue"
import type {HtmlHTMLAttributes} from "vue"

import BaseIcon from "../BaseIcon/BaseIcon.vue"
import {cn} from "@/utils/tailwindcss"

import {useExpansionPanelGroup} from "./useExpansionPanelGroup"

const props = withDefaults(
  defineProps<{
    icon?: IconName
    label?: string
    opened?: boolean
    group?: string
    disabled?: boolean
    class?: HtmlHTMLAttributes["class"]
    contentClass?: HtmlHTMLAttributes["class"]
  }>(),
  {
    opened: false,
    disabled: false,
    class: "",
    contentClass: "",
  },
)

const isOpened = props.group ? useExpansionPanelGroup(props.group, props.opened) : ref(props.opened)

function onToggle() {
  isOpened.value = !isOpened.value
}

const classes = computed(() => {
  return cn(["overflow-hidden flex flex-col items-center justify-between transition-colors outline-none", props.class])
})
</script>

<template>
  <div :class="classes">
    <div
      class="bg-base-100 text-base-content hover:bg-base-300 focus-visible:bg-base-200 flex w-full items-center justify-between px-4 py-2 text-base transition-colors duration-200 outline-none"
      :tabindex="disabled ? undefined : 0"
      @click="onToggle"
      @keydown.enter="onToggle"
      @keydown.space="onToggle"
    >
      <slot name="header">
        <div class="flex items-center gap-2 select-none">
          <BaseIcon v-if="icon" :name="icon" class="size-5" />
          {{ label }}
        </div>
      </slot>
      <BaseIcon name="chevron-up" class="mx-2 size-4 transition-transform duration-300" :class="{'rotate-180': isOpened}" />
    </div>

    <div
      v-if="isOpened"
      :class="cn('bg-base-200/40 border-base-300 text-base-content relative flex size-full flex-col border-t p-4', props.contentClass)"
    >
      <slot />
    </div>
  </div>
</template>
