<script setup lang="ts">
import {computed, ref} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {Tag} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import TagsForm from "./fragments/TagsForm.vue"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const filterStore = useFilterStore()
const isCreating = ref(false)

const tags = computed(() => tagsStore.tags)

async function deleteTag(id: Tag["id"]) {
  filterStore.removeActiveTag(id)
  await tagsStore.deleteTag(id)
  await tasksStore.revalidate()
}
</script>

<template>
  <TagsForm v-if="isCreating" :tags="tagsStore.tags" class="px-4 py-6" @submit="tagsStore.createTag" @close="isCreating = false" />

  <div v-else class="flex flex-col gap-2 px-4 py-4">
    <BaseButton class="py- w-full text-sm" variant="outline" icon="plus" @click="isCreating = true">Create new tag</BaseButton>

    <div v-if="tags.length" class="flex max-h-[200px] flex-wrap gap-2 overflow-y-auto p-2">
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
    <div v-else class="flex h-full flex-col items-center justify-center gap-2 p-2">
      <p class="text-base-content/50 text-sm">
        <BaseIcon name="tags" class="size-4" />

        No tags yet
      </p>
    </div>
  </div>
</template>
