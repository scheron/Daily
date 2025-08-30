<script lang="ts" setup>
import {computed, ref} from "vue"
import {onClickOutside} from "@vueuse/core"
import {cn} from "@/utils/tailwindcss"
// @ts-ignore
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"

import BaseButton from "./BaseButton.vue"

type HorizontalPosition = "start" | "center" | "end"

const props = withDefaults(
  defineProps<{
    title?: string
    hideHeader?: boolean
    hideCloseBtn?: boolean
    position?: HorizontalPosition
    triggerClass?: string
    contentClass?: string
    containerClass?: string
  }>(),
  {
    hideCloseBtn: false,
    hideHeader: false,
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
  isOpen,
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
      :class="cn('bg-base-100 border-base-300 z-50 max-h-[300px] min-w-52 overflow-y-auto rounded-lg border p-2 shadow-lg', containerClass)"
      :style="floatingStyles"
    >
      <div :class="cn('flex flex-col gap-1', contentClass)">
        <div v-if="!(hideHeader || hideCloseBtn)" class="border-base-300 flex items-center justify-between border-b pb-1">
          <span v-if="title" class="text-base-content/70 pl-4 text-xs uppercase font-semibold">{{ title }}</span>

          <BaseButton
            v-if="!hideCloseBtn"
            icon="x-mark"
            variant="ghost"
            size="sm"
            icon-class="size-4"
            class="focus-visible-ring text-base-content/70 hover:text-base-content ml-auto rounded-full p-1"
            @click="hide"
          />
        </div>

        <slot :hide="hide" :show="show" :toggle="toggle" :is-open="isOpen"  />
      </div>
    </div>
  </Teleport>
</template>
