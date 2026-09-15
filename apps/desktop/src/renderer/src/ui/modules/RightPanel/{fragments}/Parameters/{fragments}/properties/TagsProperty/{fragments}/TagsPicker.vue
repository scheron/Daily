<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import TagsCombobox from "@/ui/common/comboboxes/TagsCombobox.vue"

import type {Tag, Task} from "@daily/protocol"

defineProps<{task: Task}>()

const emit = defineEmits<{update: [tags: Tag[]]}>()
</script>

<template>
  <BasePopup hide-header position="start" container-class="p-0 overflow-hidden max-h-none">
    <template #trigger="{toggle}">
      <BaseButton type="button" variant="text" class="p-0 py-1" @click.stop="toggle">
        <BaseIcon name="plus" class="size-3.5" />
        <span class="leading-none"> Add tag </span>
      </BaseButton>
    </template>

    <template #default="{hide}">
      <TagsCombobox :branch-id="task.branchId" :attached="task.tags" @update="emit('update', $event)" @close="hide" />
    </template>
  </BasePopup>
</template>
