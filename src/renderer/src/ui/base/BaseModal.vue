<script setup lang="ts">
import {computed, HTMLAttributes, nextTick, ref, useTemplateRef, watch, watchEffect} from "vue"
import {useEventListener} from "@vueuse/core"

import {sleep} from "@shared/utils/common/sleep"
import {useFocusTrap} from "@/composables/useFocusTrap"
import {findFocusableEl} from "@/utils/ui/dom"
import {cn} from "@/utils/ui/tailwindcss"
import BaseButton from "@/ui/base/BaseButton.vue"
import Logo from "@/ui/common/misc/Logo.vue"

import BaseAnimation from "./BaseAnimation.vue"

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    fullscreen?: boolean
    hideHeader?: boolean
    hideToolbar?: boolean
    zIndex?: number
    contentClass?: HTMLAttributes["class"]
    containerClass?: HTMLAttributes["class"]
  }>(),
  {
    zIndex: 11,
    fullscreen: false,
  },
)

const emit = defineEmits<{close: [boolean]}>()

const zIndex = computed(() => props.zIndex + 500)
const modalRef = useTemplateRef<HTMLElement>("modal")

const _show = ref(false)

watch(
  () => props.open,
  async (newVal) => {
    await sleep(100)
    _show.value = newVal
  },
)

watchEffect(async () => {
  if (!props.open) return

  await nextTick()

  if (modalRef.value) {
    const focusableEl = findFocusableEl(modalRef.value)
    if (focusableEl) focusableEl.focus()
  }
})

useFocusTrap(
  modalRef,
  computed(() => props.open),
)
useEventListener(modalRef, "keydown", (event) => event.key === "Escape" && emit("close", false))
</script>

<template>
  <Teleport to="body">
    <BaseAnimation name="fade" mode="out-in">
      <div v-if="open" ref="modal" class="fixed inset-0 flex items-center justify-center" :style="{zIndex}" tabindex="0">
        <div class="bg-base-300/60 absolute inset-0 backdrop-blur-xs" @click="$emit('close', false)" />

        <BaseAnimation name="bounce">
          <div
            v-show="_show"
            class="bg-base-100 relative flex flex-col"
            :class="cn([fullscreen ? 'size-full' : 'h-[90vh] w-[90vw] rounded-lg'], containerClass)"
          >
            <div v-if="!hideHeader" class="border-base-300 h-header flex items-center justify-between border-b px-4 py-1">
              <slot v-if="!hideToolbar" name="toolbar">
                <div class="text-accent flex items-center gap-2 pl-4">
                  <span v-if="title" class="text-base-content/70 text-xs font-semibold uppercase">{{ title }}</span>
                  <template v-else>
                    <Logo class="h-5" />
                    <h2 class="font-mono text-xl font-bold">Daily</h2>
                  </template>
                </div>
              </slot>

              <div class="ml-auto flex items-center gap-2">
                <slot name="actions" />
                <BaseButton variant="ghost" icon="x-mark" class="text-base-content hover:text-accent" @click="$emit('close', false)" />
              </div>
            </div>

            <div :class="cn('flex-1 overflow-y-auto md:p-4', contentClass)">
              <slot />
            </div>
          </div>
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </Teleport>
</template>
