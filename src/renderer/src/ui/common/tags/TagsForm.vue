<script setup lang="ts">
import {nextTick, ref, useTemplateRef} from "vue"
import {toasts} from "vue-toasts-lite"

import {TAG_QUICK_COLORS} from "@shared/constants/theme/colorPalette"
import {findTagByName, isValidTagName, normalizeTagName} from "@shared/utils/tags/tagName"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseInput from "@/ui/base/BaseInput.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import ColorPicker from "@/ui/common/pickers/ColorPicker.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

import type {Tag} from "@shared/types/storage"

const tagsStore = useTagsStore()
const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const createInput = useTemplateRef<{focus: () => void}>("createInput")
const editInput = ref<{focus: () => void} | null>(null)

const newTagName = ref("")
const newTagColor = ref(TAG_QUICK_COLORS[0])

const editingId = ref<Tag["id"] | null>(null)
const editingName = ref("")
const editingColor = ref("")

function onSelectColor(color: string, hide: () => void) {
  newTagColor.value = color
  hide()
  nextTick(() => createInput.value?.focus())
}

function setEditInputRef(el: unknown) {
  editInput.value = el as {focus: () => void} | null
}

function onSelectEditColor(color: string, hide: () => void) {
  editingColor.value = color
  hide()
  nextTick(() => editInput.value?.focus())
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
  const name = normalizeTagName(newTagName.value)
  if (!isValidTagName(name)) return

  if (findTagByName(tagsStore.tags, name)) {
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
  const name = normalizeTagName(editingName.value)
  if (!isValidTagName(name)) return

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
  <div class="flex h-full flex-col gap-2">
    <div class="group border-base-300 focus-within:border-accent flex h-8 items-center gap-2 rounded-md border border-dashed px-2 transition-colors">
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
        focus-on-mount
        placeholder="New tag"
        class="h-full flex-1 text-xs"
        @keyup.enter="createTag"
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

    <div class="flex w-full flex-col gap-0.5 overflow-y-auto">
      <div v-for="tag in tagsStore.tags" :key="tag.id">
        <div v-if="editingId === tag.id" class="border-base-300 focus-within:border-accent flex h-8 items-center gap-2 rounded-md border px-2">
          <BasePopup triggerClass="flex shrink-0 items-center justify-center" hide-header position="center">
            <template #trigger="{toggle}">
              <button type="button" class="size-3.5 shrink-0 rounded-full" :style="{backgroundColor: editingColor}" @click="toggle" />
            </template>

            <template #default="{hide}">
              <ColorPicker @selected="onSelectEditColor($event, hide)" />
            </template>
          </BasePopup>

          <BaseInput
            :ref="setEditInputRef"
            v-model="editingName"
            bare
            hide-outline
            focus-on-mount
            class="h-full flex-1 text-xs"
            @keyup.enter="renameTag(tag.id)"
          />

          <BaseButton icon="check" variant="ghost" icon-class="size-4" class="size-6 shrink-0 p-0" @click="renameTag(tag.id)" />
          <BaseButton icon="x-mark" variant="ghost" icon-class="size-4" class="size-6 shrink-0 p-0" @click="cancelEdit" />
        </div>

        <div v-else class="group hover:bg-base-200 flex h-8 items-center gap-2 rounded-md px-2 transition-colors">
          <span class="size-3 shrink-0 rounded-full" :style="{backgroundColor: tag.color}" />
          <span class="text-base-content/80 flex-1 truncate text-left text-xs">#{{ tag.name }}</span>

          <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <BaseButton icon="pencil" variant="ghost" icon-class="size-4" class="size-6 p-0" @click="startEdit(tag)" />

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
                <BaseButton icon="trash" variant="ghost" icon-class="size-4" class="text-error hover:bg-error/10 size-6 p-0" @click="show" />
              </template>
            </ConfirmPopup>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
