<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue"
import {useEventListener} from "@vueuse/core"

import {useFocusTrap} from "@/composables/useFocusTrap"
import {findFocusableEl} from "@/utils/ui/dom"

import {useBaseModal} from "../composables/useBaseModal"

import type {ModalItem} from "../types"

const props = defineProps<{
  item: ModalItem
  index: number
  isTop: boolean
}>()

const {hide, remove} = useBaseModal()

const rootRef = ref<HTMLElement | null>(null)
let restoreFocusTo: HTMLElement | null = null

useFocusTrap(
  rootRef,
  computed(() => props.isTop && !props.item.closing),
)

useEventListener(document, "keydown", (event: KeyboardEvent) => {
  if (event.key === "Escape" && props.isTop && !props.item.closing) requestClose()
})

function requestClose() {
  const onClose = props.item.props.onClose
  if (typeof onClose === "function") onClose()
  else hide(props.item.id)
}

onMounted(() => {
  restoreFocusTo = document.activeElement as HTMLElement
  if (rootRef.value) findFocusableEl(rootRef.value)?.focus()
})

onBeforeUnmount(() => {
  restoreFocusTo?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      enter-from-class="opacity-0 scale-95"
      enter-active-class="transition duration-150 ease-out"
      enter-to-class="opacity-100 scale-100"
      leave-from-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 scale-95"
      @after-leave="remove(item.id)"
    >
      <div v-if="!item.closing" ref="rootRef" class="fixed inset-0" :style="{zIndex: 1000 + index}">
        <component :is="item.component" v-bind="item.props" />
      </div>
    </Transition>
  </Teleport>
</template>
