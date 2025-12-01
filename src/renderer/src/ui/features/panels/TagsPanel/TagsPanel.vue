<script setup lang="ts">
import {computed} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {Tag} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"

import TagsForm from "./fragments/TagsForm.vue"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const filterStore = useFilterStore()

const tags = computed(() => tagsStore.tags)

async function deleteTag(id: Tag["id"]) {
  filterStore.removeActiveTag(id)
  await tagsStore.deleteTag(id)
  await tasksStore.revalidate()
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 px-4 py-4">
    <h3 class="text-base-content text-sm font-semibold">Tags</h3>
    <TagsForm :tags="tagsStore.tags" @submit="tagsStore.createTag" />
    <div>
      <div v-if="tags.length" class="flex flex-1 flex-wrap gap-2 overflow-y-auto p-2">
        <div
          v-for="tag in tags"
          :key="tag.id"
          class="group flex w-full flex-1 items-center justify-between rounded-md border py-1 pr-1 pl-3 text-sm"
          :style="{
            backgroundColor: `${tag.color}10`,
            borderColor: `${tag.color}20`,
            color: tag.color,
          }"
        >
          <span class="text-base leading-0">#</span>
          <span class="truncate">{{ tag.name }}</span>

          <BaseButton
            class="ml-auto shrink-0 p-0.5 opacity-60 transition-opacity hover:opacity-100"
            variant="text"
            icon-class="size-3.5"
            :style="{color: tag.color}"
            icon="x-mark"
            @click="deleteTag(tag.id)"
          />
        </div>
      </div>
    </div>

    <div class="border-base-300 flex flex-col gap-2 rounded-md border p-3">
      <h3 class="text-xs font-medium">About Tags</h3>
      <p class="text-base-content/60 text-xs leading-relaxed">
        Tags help you organize and categorize your tasks. Create custom tags with different colors to quickly filter and find related tasks.
      </p>
    </div>
  </div>
</template>
