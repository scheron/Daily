<script setup lang="ts">
import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {TAG_PRESET_COLORS} from "@shared/constants/tagColorPalette"
import {sortTags} from "@shared/utils/tags/sortTags"
import {findTagByName, normalizeTagName} from "@shared/utils/tags/tagName"
import {useTagsStore} from "@/stores/tags.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"

import type {Tag, Task} from "@shared/types/storage"
import type {TagPresetColor} from "@shared/types/theme"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{update: [tags: Tag[]]; close: []}>()

const tagsStore = useTagsStore()

const query = ref("")
const mode = ref<"list" | "create">("list")
const isCreating = ref(false)

const selectedIds = computed(() => new Set(props.task.tags.map((tag) => tag.id)))
const sortedTags = computed(() => sortTags(tagsStore.tags))
const trimmedQuery = computed(() => normalizeTagName(query.value))

function isSelected(tag: Tag): boolean {
  return selectedIds.value.has(tag.id)
}

function toggleTag(tag: Tag) {
  const next = isSelected(tag) ? props.task.tags.filter((t) => t.id !== tag.id) : [...props.task.tags, tag]
  emit("update", next)
}

function enterCreateMode() {
  if (!trimmedQuery.value || findTagByName(tagsStore.tags, trimmedQuery.value)) return
  mode.value = "create"
}

function cancelCreate() {
  mode.value = "list"
}

async function createWithColor(color: TagPresetColor) {
  if (isCreating.value) return

  const name = trimmedQuery.value
  if (!name) return

  isCreating.value = true
  const created = await tagsStore.createTag(name, color.value)
  isCreating.value = false

  if (!created) {
    toasts.error("Failed to create tag")
    return
  }

  emit("update", [...props.task.tags, created])
  query.value = ""
  mode.value = "list"
}
</script>

<template>
  <div class="w-70">
    <BaseCombobox
      v-if="mode === 'create'"
      single
      :items="TAG_PRESET_COLORS"
      :item-key="(color) => color.value"
      :filter-by="(color) => color.name"
      :placeholder="`Color for #${trimmedQuery}`"
      empty-text="No colors found"
      @select="createWithColor"
      @escape="cancelCreate"
      @backspace-empty="cancelCreate"
    >
      <template #prefix>
        <BaseButton type="button" variant="ghost" icon="chevron-left" icon-class="size-4" class="size-7 shrink-0 p-0" @click="cancelCreate" />
      </template>

      <template #item="{item}">
        <span class="size-3 shrink-0 rounded-full" :style="{backgroundColor: item.value}" />
        <span class="flex-1 truncate">{{ item.name }}</span>
      </template>
    </BaseCombobox>

    <BaseCombobox
      v-else
      :items="sortedTags"
      :item-key="(tag) => tag.id"
      :filter-by="(tag) => tag.name"
      :selected="isSelected"
      placeholder="Search or create tags..."
      empty-text="No tags found"
      @update:query="query = $event"
      @select="toggleTag"
      @select-footer="enterCreateMode"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <span class="size-2.5 shrink-0 rounded-full" :style="{backgroundColor: item.color}" />
        <span class="flex-1 truncate">{{ item.name }}</span>
      </template>

      <template #footer="{query: createName}">
        <BaseIcon name="plus" class="text-base-content/60 size-4 shrink-0" />
        <span class="truncate"
          >Create <span class="font-medium">"{{ createName }}"</span></span
        >
      </template>
    </BaseCombobox>
  </div>
</template>
