<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef} from "vue"
import {toasts} from "vue-toasts-lite"

import {findTagByName, isValidTagName, normalizeTagName, TAG_QUICK_COLORS} from "@daily/protocol"

import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks"
import BaseInput from "@/ui/base/BaseInput.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import ColorPicker from "@/ui/common/pickers/ColorPicker.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

import type {Branch, Tag} from "@daily/protocol"

const props = defineProps<{branchId: Branch["id"]}>()

const tagsStore = useTagsStore()
const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const projectTags = computed(() => tagsStore.tagsForBranch(props.branchId))

const createInput = useTemplateRef<{focus: () => void}>("createInput")

const isCreating = ref(false)
const newTagName = ref("")
const newTagColor = ref(TAG_QUICK_COLORS[0])

function startCreate() {
  isCreating.value = true
  newTagName.value = ""
  newTagColor.value = TAG_QUICK_COLORS[0]
  nextTick(() => createInput.value?.focus())
}

function cancelCreate() {
  isCreating.value = false
  newTagName.value = ""
}

function onSelectColor(color: string, hide: () => void) {
  newTagColor.value = color
  hide()
  nextTick(() => createInput.value?.focus())
}

function onNameKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") createTag()
  if (event.key === "Escape") cancelCreate()
}

async function createTag() {
  const name = normalizeTagName(newTagName.value)
  if (!isValidTagName(name)) {
    cancelCreate()
    return
  }

  if (findTagByName(projectTags.value, name)) {
    toasts.error("Tag with this name already exists")
    return
  }

  const created = await tagsStore.createTag(name, newTagColor.value, props.branchId)
  if (!created) {
    toasts.error("Failed to create tag")
    return
  }

  cancelCreate()
  toasts.success("Tag created")
}

async function deleteTag(tag: Tag) {
  filterStore.removeActiveTag(tag.id)
  const deleted = await tagsStore.deleteTag(tag.id)
  if (!deleted) {
    toasts.error("Failed to delete tag")
    return
  }

  await tasksStore.revalidate()
  toasts.success("Tag deleted")
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
    <button
      v-if="!isCreating"
      type="button"
      class="text-base-content/70 hover:text-base-content inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      @click="startCreate"
    >
      <span class="text-base leading-none">+</span>
      <span>Add tag</span>
    </button>

    <div v-else class="border-base-300 focus-within:border-accent flex h-8 items-center gap-2 rounded-md border border-dashed px-2 transition-colors">
      <BasePopup triggerClass="flex shrink-0 items-center justify-center" hide-header position="center">
        <template #trigger="{toggle}">
          <button type="button" class="relative size-3.5 shrink-0 overflow-hidden rounded-full" @click="toggle">
            <div class="absolute inset-0 bg-[conic-gradient(from_0deg,red,yellow,lime,aqua,blue,magenta,red)]" />
            <div class="absolute inset-0.5 rounded-full" :style="{backgroundColor: newTagColor}" />
          </button>
        </template>

        <template #default="{hide}">
          <ColorPicker @selected="onSelectColor($event, hide)" />
        </template>
      </BasePopup>

      <BaseInput
        ref="createInput"
        v-model="newTagName"
        bare
        hide-outline
        placeholder="New tag"
        class="h-full w-32 text-xs"
        @keydown="onNameKeydown"
      />

      <button
        type="button"
        :disabled="!isValidTagName(newTagName)"
        class="text-base-content/50 border-base-300 hover:text-base-content hover:border-base-content/30 disabled:hover:text-base-content/50 disabled:hover:border-base-300 shrink-0 rounded border px-1.5 text-[11px] leading-5 transition-colors disabled:opacity-40"
        @click="createTag"
      >
        ↵
      </button>
    </div>

    <div v-for="tag in projectTags" :key="tag.id" class="inline-flex items-baseline gap-1 text-sm font-medium" :style="{color: tag.color}">
      <span>#{{ tag.name }}</span>

      <ConfirmPopup
        title="Delete tag?"
        message="This tag will be removed from all tasks!"
        confirm-text="Delete"
        cancel-text="Cancel"
        position="start"
        content-class="max-w-72"
        @confirm="deleteTag(tag)"
      >
        <template #trigger="{show}">
          <button type="button" class="opacity-55 transition-opacity hover:opacity-100" @click="show">×</button>
        </template>
      </ConfirmPopup>
    </div>
  </div>
</template>
