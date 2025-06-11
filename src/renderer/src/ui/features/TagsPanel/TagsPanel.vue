<script setup lang="ts">
import {computed, ref} from "vue"

import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import TagsForm from "./fragments/TagsForm.vue"
import { useFilterStore } from "@/stores/filter.store"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const filterStore = useFilterStore()
const isCreating = ref(false)

const tags = computed(() => tagsStore.tags)

async function deleteTag(id: string) {
  filterStore.removeActiveTag(id)
  await tagsStore.deleteTag(id)
  await tasksStore.revalidateTasks()
}
</script>

<template>
  <TagsForm v-if="isCreating" :tags="tagsStore.tags" @submit="tagsStore.createTag" @close="isCreating = false" />

  <div v-else class="flex flex-col px-4 pb-6 pt-2 gap-2">
    <BaseButton class="py- text-sm w-full" variant="outline" icon="plus" @click="isCreating = true">Create new tag</BaseButton>

    <div v-if="tags.length" class="flex flex-wrap gap-2 p-2 max-h-[200px] overflow-y-auto">
      <div
        v-for="tag in tags"
        :key="tag.id"
        class="group flex items-center justify-between gap-1 flex-1 rounded-md pl-3 pr-1 py-1 text-sm w-full"
        :style="{
          backgroundColor: `${tag.color}20`,
          color: tag.color,
        }"
      >
        <span class="truncate">{{ tag.name }}</span>

        <BaseButton
          class="opacity-60 p-0.5 ml-auto hover:opacity-100 transition-opacity shrink-0"
          variant="text"
          icon-class="size-3.5"
          icon="x-mark"
          @click="deleteTag(tag.id)"
        />
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center p-2 h-full gap-2">
      <p class="text-base-content/50 text-sm">No tags yet</p>
    </div>
  </div>
</template>
