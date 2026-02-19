<script setup lang="ts">
import {computed} from "vue"

import {useTagsStore} from "@/stores/tags.store"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BaseTag from "@/ui/base/BaseTag.vue"

import type {ContextMenuItem} from "@/ui/common/misc/ContextMenu"
import type {Tag, Task} from "@shared/types/storage"

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {tags: () => []})
const emit = defineEmits<{update: [tags: Tag[]]}>()

const tagsStore = useTagsStore()

const taskTags = computed(() => props.task.tags.map((tag) => tag.id))

const menuItems = computed<ContextMenuItem[]>(() => {
  return tagsStore.tags.map((tag) => ({
    value: tag.id,
    class: "p-0",
    label: tag.name,
    icon: "heading",
    tag: tag,
  }))
})

async function onSelectTag(tagId?: Tag["id"] | null) {
  if (!tagId) return
  if (!tagsStore.tagsMap.get(tagId)) return

  const currentTags = props.task.tags

  const hasTag = currentTags.some((currentTag) => currentTag.id === tagId)
  const nextTags: Tag[] = hasTag ? currentTags.filter(({id}) => id !== tagId) : [...currentTags, tagsStore.tagsMap.get(tagId)!]

  emit("update", nextTags)
}
</script>

<template>
  <BaseMenu :items="menuItems" class="flex flex-col gap-1" @select="onSelectTag">
    <template #item="{value}">
      <BaseTag :tag="tagsStore.tagsMap.get(value!)!" :active="taskTags.includes(value!)" class="w-full justify-start text-start" />
    </template>
  </BaseMenu>
</template>
