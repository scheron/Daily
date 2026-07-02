<script lang="ts" setup>
import {computed, onBeforeUnmount, ref, StyleValue} from "vue"
import {onClickOutside} from "@vueuse/core"

import {cn} from "@/utils/ui/tailwindcss"
import BaseButton from "@/ui/base/BaseButton"

// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"

export type HorizontalPosition = "start" | "center" | "end"

const props = withDefaults(
  defineProps<{
    title?: string
    hideHeader?: boolean
    hideCloseBtn?: boolean
    hoverMode?: boolean
    side?: "top" | "bottom"
    position?: HorizontalPosition
    triggerClass?: string
    contentClass?: string
    containerClass?: string
    style?: StyleValue
  }>(),
  {
    hideCloseBtn: false,
    hideHeader: false,
    hoverMode: false,
    side: "bottom",
    position: "start",
    contentClass: "",
    containerClass: "",
  },
)

const emit = defineEmits<{
  close: []
}>()

const isOpen = ref(false)
const trigger = ref<HTMLElement | null>(null)
const popup = ref<HTMLElement | null>(null)

const placement = computed(() => {
  if (props.side === "top") {
    if (props.position === "start") return "top-start"
    if (props.position === "end") return "top-end"
    return "top"
  }
  if (props.position === "start") return "bottom-start"
  if (props.position === "end") return "bottom-end"
  return "bottom"
})

const {floatingStyles} = useFloating(trigger, popup, {
  placement,
  middleware: [offset(4), flip(), shift()],
  whileElementsMounted: autoUpdate,
})

onClickOutside(popup, (event) => {
  if (trigger.value && !trigger.value.contains(event.target as Node)) {
    hide()
  }
})

let hideTimer: ReturnType<typeof setTimeout> | null = null

function cancelHide() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleHide() {
  if (!props.hoverMode) return
  hideTimer = setTimeout(hide, 150)
}

function show() {
  cancelHide()
  isOpen.value = true
}

function hide() {
  cancelHide()
  isOpen.value = false
  emit("close")
}

function toggle() {
  isOpen.value ? hide() : show()
}

onBeforeUnmount(() => {
  if (isOpen.value) isOpen.value = false
  cancelHide()
})

defineExpose({
  show,
  hide,
  toggle,
  isOpen,
})
</script>

<template>
  <div ref="trigger" :style="style" :class="triggerClass" @mouseleave="scheduleHide">
    <slot name="trigger" :show="show" :hide="hide" :toggle="toggle" :open="isOpen" />
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="popup"
      data-popup
      :class="cn('bg-base-100 border-base-300 z-999 max-h-[300px] min-w-52 overflow-y-auto rounded-lg border p-1 shadow-lg', containerClass)"
      :style="floatingStyles"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
    >
      <div :class="cn('flex flex-col gap-1', contentClass)">
        <div v-if="!(hideHeader || hideCloseBtn)" class="border-base-300 flex items-center justify-between border-b pb-1">
          <slot name="title">
            <span v-if="title" class="text-base-content/70 pl-4 text-xs font-semibold uppercase">{{ title }}</span>
          </slot>

          <BaseButton
            v-if="!hideCloseBtn"
            icon="x-mark"
            variant="ghost"
            size="sm"
            icon-class="size-4"
            class="focus-visible-accent text-base-content/70 hover:text-base-content ml-auto rounded-full p-1"
            @click="hide"
          />
        </div>

        <slot :hide="hide" :show="show" :toggle="toggle" :open="isOpen" />
      </div>
    </div>
  </Teleport>
</template>
