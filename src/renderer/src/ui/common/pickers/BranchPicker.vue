<script setup lang="ts">
import {useTemplateRef} from "vue"

import BasePopup from "@/ui/base/BasePopup.vue"
import BranchCombobox from "@/ui/common/comboboxes/BranchCombobox.vue"

import type {HorizontalPosition} from "@/ui/base/BasePopup.vue"
import type {Branch} from "@shared/types/storage"

withDefaults(defineProps<{selectedId: Branch["id"] | null; position?: HorizontalPosition; triggerClass?: string}>(), {
  position: "start",
})

const emit = defineEmits<{select: [branch: Branch]}>()

const popup = useTemplateRef<{show: () => void; hide: () => void; toggle: () => void}>("popup")

function open() {
  popup.value?.show()
}

function close() {
  popup.value?.hide()
}

function toggle() {
  popup.value?.toggle()
}

defineExpose({open, close, toggle})
</script>

<template>
  <BasePopup ref="popup" hide-header :position="position" :trigger-class="triggerClass" container-class="p-0 overflow-hidden max-h-none">
    <template #trigger="{toggle: openPopup}">
      <slot name="trigger" :toggle="openPopup" />
    </template>

    <template #default="{hide}">
      <BranchCombobox :selected-id="selectedId" @select="emit('select', $event)" @close="hide" />
    </template>
  </BasePopup>
</template>
