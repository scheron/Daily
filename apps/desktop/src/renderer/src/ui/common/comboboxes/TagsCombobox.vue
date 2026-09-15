<script setup lang="ts">
import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {findTagByName, normalizeTagName, sortTags, TAG_PRESET_COLORS} from "@daily/protocol"

import {useTagsStore} from "@/stores/tags.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"

import type {Branch, Tag, TagPresetColor} from "@daily/protocol"

const props = defineProps<{
  branchId: Branch["id"]
  /** Omit it to only browse and create, with no checkboxes. */
  attached?: readonly Tag[]
}>()
const emit = defineEmits<{update: [tags: Tag[]]; close: []}>()

const tagsStore = useTagsStore()

const query = ref("")
const mode = ref<"list" | "create">("list")
const isCreating = ref(false)

const isAttaching = computed(() => props.attached !== undefined)
const attachedTags = computed(() => props.attached ?? [])
const attachedIds = computed(() => new Set(attachedTags.value.map((tag) => tag.id)))
const projectTags = computed(() => tagsStore.tagsForBranch(props.branchId))
const sortedTags = computed(() => sortTags(projectTags.value))
const trimmedQuery = computed(() => normalizeTagName(query.value))

function isAttached(tag: Tag): boolean {
  return attachedIds.value.has(tag.id)
}

function toggleTag(tag: Tag) {
  if (!isAttaching.value) return

  const next = isAttached(tag) ? attachedTags.value.filter((t) => t.id !== tag.id) : [...attachedTags.value, tag]
  emit("update", next)
}

function enterCreateMode() {
  if (!trimmedQuery.value || findTagByName(projectTags.value, trimmedQuery.value)) return
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
  const created = await tagsStore.createTag(name, color.value, props.branchId)
  isCreating.value = false

  if (!created) {
    toasts.error("Failed to create tag")
    return
  }

  if (isAttaching.value) emit("update", [...attachedTags.value, created])

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
      :selected="isAttaching ? isAttached : undefined"
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
