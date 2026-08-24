<script setup lang="ts">
import {useTemplateRef} from "vue"

import BaseButton from "../../base/BaseButton"
import BaseIcon from "../../base/BaseIcon"
import BasePopup from "../../base/BasePopup.vue"
import TagsCombobox from "../comboboxes/TagsCombobox.vue"

import type {Tag, Task} from "@daily/protocol"
import type {HorizontalPosition} from "../../base/BasePopup.vue"

withDefaults(defineProps<{task: Task; position?: HorizontalPosition; triggerClass?: string}>(), {
  position: "start",
})

const emit = defineEmits<{update: [tags: Tag[]]}>()

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
  <BasePopup
    ref="popup"
    hide-header
    hide-close-btn
    :position="position"
    :trigger-class="triggerClass"
    container-class="p-0 overflow-hidden max-h-none"
  >
    <template #trigger="{toggle: openPopup}">
      <slot name="trigger" :toggle="openPopup">
        <BaseButton type="button" size="sm" variant="text" class="p-0 py-1" @click.stop="openPopup">
          <BaseIcon name="plus" class="size-3.5" />
          <span class="leading-none"> Add tag </span>
        </BaseButton>
      </slot>
    </template>

    <template #default="{hide}">
      <TagsCombobox :task="task" @update="emit('update', $event)" @close="hide" />
    </template>
  </BasePopup>
</template>
