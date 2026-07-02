<script setup lang="ts">
import {computed} from "vue"

import {sortTags} from "@shared/utils/tags/sortTags"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseTag from "@/ui/base/BaseTag"
import TagsPicker from "@/ui/common/pickers/TagsPicker.vue"

import type {Tag, Task} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((t) => tagsStore.tagsMap.get(t.id)).filter(Boolean) as Tag[]))

function onUpdateTags(nextTags: Tag[]) {
  taskEditorStore.patch({tags: nextTags})
}

function onRemoveTag(id: Tag["id"]) {
  taskEditorStore.patch({tags: props.task.tags.filter((t) => t.id !== id)})
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
    <div class="mr-2 flex h-7 items-center">
      <TagsPicker :task="task" @update="onUpdateTags" />
    </div>

    <BaseTag v-for="tag in tags" :key="tag.id" :tag="tag" size="md" class="px-0.5" removable @remove="onRemoveTag(tag.id)" />
  </div>
</template>
