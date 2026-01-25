<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import {useProgressFill} from "@/composables/useProgressFill"
import {oklchToHex} from "@/utils/colors/oklchToHex"
import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

type HorizontalPosition = "start" | "center" | "end"

withDefaults(
  defineProps<{
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    confirmClass?: string
    cancelClass?: string
    position?: HorizontalPosition
    containerClass?: string
    contentClass?: string
    triggerClass?: string
  }>(),
  {
    confirmText: "Confirm",
    cancelText: "Cancel",
    position: "start",
    containerClass: "",
    contentClass: "",
    triggerClass: "",
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
  close: []
}>()

const themeStore = useThemeStore()

const deleteButtonRef = useTemplateRef<HTMLDivElement>("deleteButton")
const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

const {isFilling} = useProgressFill(deleteButtonRef, {
  color: computed(() => `${oklchToHex(themeStore.currentTheme.colorScheme.error)}60`),
  duration: 500,
  onComplete: () => onConfirm(hide),
})

function show() {
  popupRef.value?.show()
}

function hide() {
  popupRef.value?.hide()
}

function toggle() {
  popupRef.value?.toggle()
}

function onConfirm(hidePopup: () => void) {
  emit("confirm")
  hidePopup()
}

function onCancel(hidePopup: () => void) {
  emit("cancel")
  hidePopup()
}

defineExpose({
  show,
  hide,
  toggle,
})
</script>

<template>
  <BasePopup
    ref="popupRef"
    hide-header
    :position="position"
    :trigger-class="triggerClass"
    :container-class="containerClass"
    :content-class="contentClass"
    @close="emit('close')"
  >
    <template #trigger="{toggle, hide, show}">
      <slot name="trigger" :toggle="toggle" :hide="hide" :show="show" />
    </template>

    <template #default="{hide}">
      <div class="flex min-w-56 flex-col gap-3">
        <div class="flex">
          <div class="flex flex-col gap-1">
            <span v-if="title" class="text-base-content text-sm font-semibold">{{ title }}</span>
            <span v-if="message" class="text-base-content/70 text-xs whitespace-pre-line">{{ message }}</span>
          </div>

          <BaseButton icon="x-mark" variant="text" icon-class="size-4" class="ml-auto size-5 p-0" @click="onCancel(hide)" />
        </div>

        <div class="flex items-center justify-end gap-2">
          <BaseButton variant="text" size="sm" class="py-0.5" @click="onCancel(hide)">
            {{ cancelText }}
          </BaseButton>

          <div ref="deleteButton" class="rounded-md">
            <BaseButton
              variant="ghost"
              size="sm"
              class="text-error! hover:bg-error/10 flex size-full items-center justify-center py-0.5"
              :class="{'text-error!': isFilling}"
            >
              {{ confirmText }}
            </BaseButton>
          </div>
        </div>
      </div>
    </template>
  </BasePopup>
</template>
