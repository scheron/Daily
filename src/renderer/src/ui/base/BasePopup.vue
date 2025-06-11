<script lang="ts" setup>
import {computed, ref} from "vue"
import {onClickOutside} from "@vueuse/core"
// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"

import BaseButton from "./BaseButton.vue"

type HorizontalPosition = "start" | "center" | "end"

const props = withDefaults(defineProps<{
  title?: string
  hideCloseBtn?: boolean
  position?: HorizontalPosition
  triggerClass?: string
}>(), {
  hideCloseBtn: false,
  position: "start",
})

const emit = defineEmits<{
  close: []
}>()

const isOpen = ref(false)
const trigger = ref<HTMLElement | null>(null)
const popup = ref<HTMLElement | null>(null)

const placement = computed(() => {
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

function show() {
  isOpen.value = true
}

function hide() {
  isOpen.value = false
  emit("close")
}

function toggle() {
  isOpen.value ? hide() : show()
}

defineExpose({
  show,
  hide,
  toggle,
})
</script>

<template>
  <div ref="trigger" :class="triggerClass">
    <slot name="trigger" :show="show" :hide="hide" :toggle="toggle" />
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="popup"
      class="z-50 bg-base-100 rounded-lg shadow-lg border border-base-300 p-2 min-w-52 max-h-[300px] overflow-y-auto"
      :style="floatingStyles"
    >
      <div class="flex flex-col gap-1">
        <div v-if="title || !hideCloseBtn" class="flex items-center justify-between pb-1 border-b border-base-300">
          <span v-if="title" class="text-sm pl-1 font-semibold text-base-content/70">{{ title }}</span>

          <BaseButton
            v-if="!hideCloseBtn"
            icon="x-mark"
            variant="ghost"
            size="sm"
            icon-class="size-4"
            class="focus-visible-ring rounded-full p-1 text-base-content/70 hover:text-base-content ml-auto"
            @click="hide"
          />
        </div>

        <slot :hide="hide" :show="show" :toggle="toggle" />
      </div>
    </div>
  </Teleport>
</template>
