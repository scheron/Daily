<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {TAG_QUICK_COLORS} from "@shared/constants/theme/colorPalette"
import {pipe} from "@shared/utils/fp/pipe"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseInput from "@/ui/base/BaseInput.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import TagsInput from "@/ui/common/inputs/TagsInput.vue"
import ConfirmPopup from "@/ui/common/misc/ConfirmPopup.vue"
import ColorPicker from "@/ui/common/pickers/ColorPicker.vue"

import type {Tag} from "@shared/types/storage"

const tagsStore = useTagsStore()
const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const newTagName = ref("")
const newTagColor = ref(TAG_QUICK_COLORS[0])

const editingId = ref<Tag["id"] | null>(null)
const editingName = ref("")
const editingColor = ref("")

function onSelectColor(color: string, hide: () => void) {
  newTagColor.value = color
  hide()
}

function startEdit(tag: Tag) {
  editingId.value = tag.id
  editingName.value = tag.name
  editingColor.value = tag.color
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ""
  editingColor.value = ""
}

async function createTag() {
  const name = newTagName.value.trim()
  if (!name || name.includes(" ")) return

  if (tagsStore.tags.some((tag) => tag.name === name)) {
    toasts.error("Tag with this name already exists")
    return
  }

  const created = await tagsStore.createTag(name, newTagColor.value)
  if (!created) {
    toasts.error("Failed to create tag")
    return
  }

  newTagName.value = ""
  newTagColor.value = TAG_QUICK_COLORS[0]
  toasts.success("Tag created")
}

async function renameTag(id: Tag["id"]) {
  const name = editingName.value.trim()
  if (!name) return

  const updated = await tagsStore.updateTag(id, {name, color: editingColor.value})
  if (!updated) {
    toasts.error("Failed to update tag")
    return
  }

  cancelEdit()
  toasts.success("Tag updated")
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
  <div class="flex h-full flex-col gap-3">
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <BasePopup triggerClass="flex items-center justify-center" hide-header position="center">
          <template #trigger="{toggle}">
            <button
              type="button"
              class="relative size-4 overflow-hidden rounded-full transition-opacity hover:opacity-100"
              :class="!TAG_QUICK_COLORS.includes(newTagColor) ? 'opacity-100' : 'opacity-40'"
              @click="toggle"
            >
              <div class="absolute inset-0 bg-[conic-gradient(from_0deg,red,yellow,lime,aqua,blue,magenta,red)]" />
              <div v-if="!TAG_QUICK_COLORS.includes(newTagColor)" class="absolute inset-0.5 rounded-full" :style="{backgroundColor: newTagColor}" />
            </button>
          </template>

          <template #default="{hide}">
            <ColorPicker @selected="onSelectColor($event, hide)" />
          </template>
        </BasePopup>
        <div class="relative flex flex-1 items-center">
          <TagsInput v-model="newTagName" class="h-8 w-full pr-10 text-xs" @keyup.enter="createTag" />
          <BaseButton
            v-if="newTagName"
            type="button"
            variant="ghost"
            icon="x-mark"
            icon-class="size-3.5"
            class="absolute right-1 opacity-50 hover:opacity-100"
            @click="newTagName = ''"
          />
        </div>
        <BaseButton
          icon="plus"
          variant="ghost"
          class="h-8 px-3 text-xs"
          :disabled="!newTagName.trim() || newTagName.includes(' ')"
          @click="createTag"
        >
          Add
        </BaseButton>
      </div>
    </div>

    <div class="flex w-full flex-col gap-2 overflow-y-auto">
      <div v-for="tag in tagsStore.tags" :key="tag.id" class="h-8 w-full">
        <div v-if="editingId === tag.id" class="grid w-full grid-cols-[1fr_auto_auto] gap-2">
          <div class="flex items-center gap-2">
            <BasePopup triggerClass="flex items-center justify-center" hide-header position="center">
              <template #trigger="{toggle}">
                <button type="button" class="size-5 shrink-0 rounded-full" :style="{backgroundColor: editingColor}" @click="toggle" />
              </template>

              <template #default="{hide}">
                <div class="flex flex-col gap-2 p-2">
                  <div class="flex items-center gap-1.5">
                    <button
                      v-for="color in TAG_QUICK_COLORS"
                      :key="color"
                      type="button"
                      class="size-5 rounded-full transition-opacity hover:opacity-100"
                      :class="editingColor === color ? 'opacity-100' : 'opacity-40'"
                      :style="{backgroundColor: color}"
                      @click="pipe(() => (editingColor = color), hide)"
                    />
                  </div>
                  <ColorPicker @selected="pipe(() => (editingColor = $event), hide)" />
                </div>
              </template>
            </BasePopup>
            <BaseInput v-model="editingName" focus-on-mount class="h-8 text-xs" @keyup.enter="renameTag(tag.id)" />
          </div>
          <BaseButton icon="check" variant="ghost" icon-class="size-4" class="size-7 p-0" @click="renameTag(tag.id)" />
          <BaseButton icon="x-mark" variant="ghost" icon-class="size-4" class="size-7 p-0" @click="cancelEdit" />
        </div>

        <div v-else class="grid w-full grid-cols-[1fr_auto_auto] gap-2">
          <span class="text-base-content/80 ml-2 flex flex-1 items-center gap-2 truncate text-left text-xs">
            <span class="size-3 shrink-0 rounded-full" :style="{backgroundColor: tag.color}" />
            <span class="truncate">#{{ tag.name }}</span>
          </span>

          <BaseButton icon="pencil" variant="ghost" icon-class="size-4" class="size-7 p-0" @click="startEdit(tag)" />

          <ConfirmPopup
            title="Delete tag?"
            message="This tag will be removed from all tasks!"
            confirm-text="Delete"
            cancel-text="Cancel"
            position="end"
            content-class="max-w-72"
            @confirm="deleteTag(tag)"
          >
            <template #trigger="{show}">
              <BaseButton icon="trash" variant="ghost" icon-class="size-4" class="text-error hover:bg-error/10 size-7 p-0" @click="show" />
            </template>
          </ConfirmPopup>
        </div>
      </div>
    </div>
  </div>
</template>
