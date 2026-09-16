<script setup lang="ts">
import {computed} from "vue"

import {sortTags} from "@daily/protocol"

import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseTag from "@/ui/base/BaseTag"
import TagsPicker from "./{fragments}/TagsPicker.vue"
import SectionHeader from "../../SectionHeader.vue"

import type {Tag, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]))

function onUpdateTags(nextTags: Tag[]) {
  taskEditorStore.patch({tags: nextTags})
}

function onRemoveTag(id: Tag["id"]) {
  taskEditorStore.patch({tags: props.task.tags.filter((tag) => tag.id !== id)})
}
</script>

<template>
  <div>
    <SectionHeader icon="tags" label="Tags" :count="tags.length">
      <template #action>
        <TagsPicker :task="task" @update="onUpdateTags" />
      </template>
    </SectionHeader>

    <div v-if="tags.length" class="flex flex-wrap items-center gap-1.5 px-2 pt-1">
      <BaseTag v-for="tag in tags" :key="tag.id" :tag="tag" size="md" class="px-0.5" removable @remove="onRemoveTag(tag.id)" />
    </div>
  </div>
</template>
