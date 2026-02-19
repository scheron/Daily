<script setup lang="ts">
import {computed} from "vue"

import {Tag} from "@shared/types/storage"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"

import TagsForm from "./{fragments}/TagsForm.vue"

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
  <div class="flex h-full flex-col px-4 py-1.5">
    <TagsForm :tags="tagsStore.tags" class="mb-2" @submit="tagsStore.createTag" />

    <div class="bg-base-300 my-1 h-px w-full" />

    <div class="h-full">
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
  </div>
</template>
