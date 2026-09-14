<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import BaseButton from "@/ui/base/BaseButton"
import BasePopup from "@/ui/base/BasePopup.vue"
import TagsCombobox from "@/ui/common/comboboxes/TagsCombobox.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

import type {Branch, Tag} from "@daily/protocol"

const props = defineProps<{branchId: Branch["id"]}>()

const tagsStore = useTagsStore()
const filterStore = useFilterStore()

const projectTags = computed(() => tagsStore.tagsForBranch(props.branchId))

async function deleteTag(tag: Tag) {
  filterStore.removeActiveTag(tag.id)
  const deleted = await tagsStore.deleteTag(tag.id)
  if (!deleted) {
    toasts.error("Failed to delete tag")
    return
  }

  toasts.success("Tag deleted")
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
    <BasePopup hide-header hide-close-btn position="start" container-class="p-0 overflow-hidden max-h-none">
      <template #trigger="{toggle}">
        <BaseButton variant="text" icon="plus" icon-class="size-3.5" class="gap-1.5 p-0 font-medium" @click="toggle">Add tag</BaseButton>
      </template>

      <template #default="{hide}">
        <TagsCombobox :branch-id="branchId" @close="hide" />
      </template>
    </BasePopup>

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
          <BaseButton variant="text" class="p-0 text-inherit opacity-55 hover:opacity-100" @click="show">×</BaseButton>
        </template>
      </ConfirmPopup>
    </div>
  </div>
</template>
