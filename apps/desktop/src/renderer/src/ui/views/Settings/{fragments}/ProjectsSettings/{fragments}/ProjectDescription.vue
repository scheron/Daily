<script setup lang="ts">
import {computed, ref, watch} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import MarkdownEditor from "@/ui/modules/RightPanel/{fragments}/Editor/{fragments}/MarkdownEditor.vue"

import type {Branch} from "@daily/protocol"

const props = defineProps<{branchId: Branch["id"]}>()

const branchesStore = useBranchesStore()

const branch = computed(() => branchesStore.branchesMap.get(props.branchId) ?? null)

const localContent = ref(branch.value?.description ?? "")

watch(
  () => props.branchId,
  () => {
    localContent.value = branch.value?.description ?? ""
  },
)

watch(
  () => branch.value?.description,
  (next) => {
    if (next === undefined || next === localContent.value) return
    localContent.value = next
  },
)

function saveDescription() {
  if (!branch.value || localContent.value === branch.value.description) return
  branchesStore.updateBranchDescription(props.branchId, localContent.value)
}
</script>

<template>
  <MarkdownEditor class="h-40" :content="localContent" @update:content="localContent = $event" @focusout="saveDescription" />
</template>
