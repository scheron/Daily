<script setup lang="ts">
import {useTemplateRef} from "vue"

import {useProgressFill} from "@/composables/useProgressFill"
import BaseButton from "@/ui/base/BaseButton"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {HorizontalPosition} from "@/ui/base/BasePopup.vue"

withDefaults(
  defineProps<{
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    position?: HorizontalPosition
    contentClass?: string
  }>(),
  {
    confirmText: "Confirm",
    cancelText: "Cancel",
    position: "start",
    contentClass: "",
  },
)

const emit = defineEmits<{
  confirm: []
}>()

const deleteButtonRef = useTemplateRef<HTMLDivElement>("deleteButton")
const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

useProgressFill(deleteButtonRef, onConfirm)

function onConfirm() {
  emit("confirm")
  popupRef.value?.hide()
}
</script>

<template>
  <BasePopup ref="popup" hide-header :position="position" :content-class="contentClass">
    <template #trigger="{show}">
      <slot name="trigger" :show="show" />
    </template>

    <template #default="{hide}">
      <div class="flex min-w-56 flex-col gap-4 p-2">
        <div class="flex">
          <div class="flex flex-col gap-1">
            <span v-if="title" class="text-base-content text-sm font-semibold">{{ title }}</span>
            <span v-if="message" class="text-base-content/70 text-xs whitespace-pre-line">{{ message }}</span>
          </div>

          <BaseButton icon="x-mark" variant="text" icon-class="size-4" class="ml-auto size-5 p-0" @click="hide()" />
        </div>

        <div class="flex items-center justify-end gap-2">
          <BaseButton variant="text" class="py-0.5" @click="hide()">
            {{ cancelText }}
          </BaseButton>

          <div ref="deleteButton" class="rounded-full">
            <BaseButton variant="ghost" class="text-error! hover:bg-error/10 flex size-full items-center justify-center py-0.5">
              {{ confirmText }}
            </BaseButton>
          </div>
        </div>
      </div>
    </template>
  </BasePopup>
</template>
