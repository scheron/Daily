<script setup lang="ts">
import {computed, ref, watch} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"

import type {Branch} from "@daily/protocol"

const props = defineProps<{branchId: Branch["id"]}>()

const branchesStore = useBranchesStore()

const branch = computed(() => branchesStore.branchesMap.get(props.branchId) ?? null)
const branchDescription = computed(() => branch.value?.description)

const localContent = ref(branch.value?.description ?? "")

function saveDescription() {
  if (!branch.value || localContent.value === branch.value.description) return
  branchesStore.updateBranchDescription(props.branchId, localContent.value)
}

watch(
  () => props.branchId,
  () => {
    localContent.value = branch.value?.description ?? ""
  },
)

watch(branchDescription, (next) => {
  if (next === undefined || next === localContent.value) return
  localContent.value = next
})
</script>

<template>
  <MarkdownEditor class="h-40" :content="localContent" @update:content="localContent = $event" @focusout="saveDescription" />
</template>
