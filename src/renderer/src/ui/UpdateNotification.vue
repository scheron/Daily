<script setup lang="ts">
import {onMounted, ref} from "vue"
import {useToggle} from "@vueuse/core"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton.vue"

const [isVisible, toggleIsVisible] = useToggle(false)

const version = ref(import.meta.env.VITE_APP_VERSION)

async function handleUpdate() {
  await window.electronAPI.installUpdate()
  toggleIsVisible(false)
}

function handleLater() {
  toggleIsVisible(false)
}

window.electronAPI.onUpdateDownloaded((version) => {
  console.log("version", version)
})

window.electronAPI.onUpdateInstall(() => {
  console.log("update installed")
})

window.electronAPI.onUpdateCheck((hasUpdate, version) => {
  console.log("hasUpdate", hasUpdate, version)
})
</script>

<template>
  <BaseAnimation name="fade" :duration="1000">
    <div v-if="isVisible" class="bg-base-100 border-base-300 fixed right-4 bottom-4 flex items-center gap-4 rounded-lg border px-4 py-3 shadow-lg">
      <div class="flex flex-col">
        <span class="text-sm font-light">New version available</span>
        <span v-if="version" class="text-base-content/50 text-xs font-semibold">Version {{ version }}</span>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton size="sm" variant="ghost" @click="handleLater">Later</BaseButton>
        <BaseButton size="sm" variant="primary" @click="handleUpdate">Update</BaseButton>
      </div>
    </div>
  </BaseAnimation>
</template>
