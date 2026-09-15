<script setup lang="ts">
import {ref, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {BaseModal} from "@/ui/base/BaseModal"

defineProps<{
  src: string | null
  alt?: string
}>()

defineEmits<{close: []}>()

const isCopied = ref(false)
const imageRef = useTemplateRef<HTMLImageElement>("image")

async function copyImageToClipboard() {
  const img = imageRef.value
  if (!img) return

  try {
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(img, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) return

    await navigator.clipboard.write([new ClipboardItem({"image/png": blob})])

    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch (error) {
    console.error("Failed to copy image to clipboard:", error)
  }
}
</script>

<template>
  <BaseModal hide-header container-class="h-auto max-h-[90vh] w-fit max-w-5xl" content-class="!p-0" @close="$emit('close')">
    <div class="relative flex h-full w-full items-center justify-center p-3 md:p-4">
      <img v-if="src" ref="image" :src="src" :alt="alt || 'Image preview'" class="max-h-[80vh] max-w-full rounded-md object-contain" />

      <BaseButton
        variant="secondary"
        :icon="isCopied ? 'check' : 'copy'"
        icon-class="size-3.5"
        class="absolute right-5 bottom-5"
        @click="copyImageToClipboard"
      >
        {{ isCopied ? "Copied" : "Copy" }}
      </BaseButton>
    </div>
  </BaseModal>
</template>
