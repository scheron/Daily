<script setup lang="ts">
import {onBeforeMount, ref} from "vue"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {truncate} from "@/utils/strings"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseCheckbox from "@/ui/base/BaseCheckbox.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()

const storagePath = ref<string>("")
const isLoading = ref(false)
const removeOld = ref(false)

async function loadStoragePath() {
  try {
    storagePath.value = await window.electronAPI.getStoragePath(true)
    console.log("storagePath", storagePath.value)
  } catch (error) {
    console.error("Failed to load storage path:", error)
    storagePath.value = "Documents/Daily"
  }
}

async function selectNewStoragePath() {
  try {
    isLoading.value = true
    await window.electronAPI.selectStoragePath(removeOld.value)
    await loadStoragePath()

    await Promise.all([tasksStore.revalidate(), tagsStore.revalidate()])
  } catch (error) {
    console.error("Failed to select storage path:", error)
  } finally {
    isLoading.value = false
  }
}

onBeforeMount(loadStoragePath)
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-base-content/70 text-xs">Choose where your tasks will be saved</p>

    <div class="flex flex-col gap-2">
      <div class="bg-base-200 rounded-lg p-3">
        <div class="flex max-w-full items-center gap-2">
          <BaseIcon name="folder" class="text-accent size-4" />
          <span class="font-mono text-sm break-all">{{ truncate(storagePath, 22, "middle") || "Loading..." }}</span>
        </div>
      </div>

      <div class="mt-1 flex items-center justify-between">
        <label class="flex items-center gap-3 pr-2 select-none" @click="removeOld = !removeOld">
          <BaseCheckbox v-model="removeOld" />
          <span class="text-sm transition-colors duration-200" :class="{'text-accent': removeOld}">Remove old data</span>
        </label>

        <BaseButton variant="outline" icon="folder-open" size="sm" :disabled="isLoading" @click="selectNewStoragePath"> Change </BaseButton>
      </div>
    </div>
  </div>
</template>
