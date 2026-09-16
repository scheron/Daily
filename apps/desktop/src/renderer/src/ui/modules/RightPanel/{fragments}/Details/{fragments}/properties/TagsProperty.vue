<script setup lang="ts">
import {computed} from "vue"

import {sortTags} from "@daily/protocol"

import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag"
import TagsCombobox from "@/ui/common/comboboxes/TagsCombobox.vue"
import ChipsCell from "../ChipsCell.vue"

import type {Tag, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]))

function onUpdate(nextTags: Tag[]) {
  taskEditorStore.patch({tags: nextTags})
}

function onRemove(id: Tag["id"]) {
  taskEditorStore.patch({tags: props.task.tags.filter((tag) => tag.id !== id)})
}
</script>

<template>
  <BasePopup hide-header position="start" trigger-class="min-w-0" container-class="p-0 overflow-hidden max-h-none">
    <template #trigger="{toggle}">
      <ChipsCell icon="tags" label="Add tags" @open="toggle">
        <BaseTag v-for="tag in tags" :key="tag.id" :tag="tag" size="sm" removable @remove="onRemove(tag.id)" />
      </ChipsCell>
    </template>

    <template #default="{hide}">
      <TagsCombobox :branch-id="task.branchId" :attached="task.tags" @update="onUpdate" @close="hide" />
    </template>
  </BasePopup>
</template>
