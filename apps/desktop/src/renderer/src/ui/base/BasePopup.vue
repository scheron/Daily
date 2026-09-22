<script setup lang="ts">
import {computed, onBeforeUnmount, ref, useTemplateRef} from "vue"
import {onClickOutside} from "@vueuse/core"

import {cn} from "@/utils/ui/tailwindcss"
// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import BaseButton from "./BaseButton"

export type HorizontalPosition = "start" | "center" | "end"

const props = withDefaults(
  defineProps<{
    hideHeader?: boolean
    hoverMode?: boolean
    side?: "top" | "bottom"
    position?: HorizontalPosition
    triggerClass?: string
    contentClass?: string
    containerClass?: string
  }>(),
  {
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

let hideTimer: ReturnType<typeof setTimeout> | null = null

const isOpen = ref(false)
const triggerRef = useTemplateRef<HTMLElement>("trigger")
const popupRef = useTemplateRef<HTMLElement>("popup")

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

const {floatingStyles} = useFloating(triggerRef, popupRef, {
  placement,
  middleware: [offset(4), flip(), shift()],
  whileElementsMounted: autoUpdate,
})

onClickOutside(popupRef, (event) => {
  if (triggerRef.value && !triggerRef.value.contains(event.target as Node)) {
    hide()
  }
})

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

function getContainerClasses() {
  return cn("bg-base-100 border-base-300 z-999 max-h-[300px] min-w-52 overflow-y-auto rounded-2xl border p-1 shadow-lg", props.containerClass)
}

function getContentClasses() {
  return cn("flex flex-col gap-1", props.contentClass)
}

onBeforeUnmount(() => {
  if (isOpen.value) isOpen.value = false
  cancelHide()
})

defineExpose({
  show,
  hide,
  toggle,
})
</script>

<template>
  <div ref="trigger" :class="triggerClass" @mouseleave="scheduleHide">
    <slot name="trigger" :show="show" :hide="hide" :toggle="toggle" />
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="popup"
      data-popup
      :class="getContainerClasses()"
      :style="floatingStyles"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
    >
      <div :class="getContentClasses()">
        <div v-if="!hideHeader" class="border-base-300 flex items-center justify-between border-b pb-1">
          <BaseButton icon="x-mark" variant="ghost-muted" size="sm" class="ml-auto" @click="hide" />
        </div>

        <slot :hide="hide" />
      </div>
    </div>
  </Teleport>
</template>
