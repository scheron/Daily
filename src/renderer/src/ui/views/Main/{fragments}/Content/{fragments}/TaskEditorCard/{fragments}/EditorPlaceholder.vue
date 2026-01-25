<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
    <div class="text-base-content border-base-300 bg-base-100 flex w-full max-w-2xl flex-row items-center gap-4 rounded-lg border p-3 text-center">
      <BaseIcon name="markdown" class="size-6 shrink-0" />

      <div class="flex flex-1 flex-col gap-2">
        <p class="text-base-content/70 text-sm font-semibold">You can use Markdown</p>

        <div class="border-base-300 flex w-full justify-around gap-2 border-t pt-2">
          <div class="flex items-center gap-1.5 text-xs">
            <kbd class="bg-base-100 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1 text-[10px]"> ⌘ </kbd>
            <span>+</span>
            <kbd class="bg-base-100 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1 text-[10px]">Enter</kbd>
            <span class="text-base-content/60">Save & Close</span>
          </div>

          <div class="flex items-center gap-1.5 text-xs">
            <kbd class="bg-base-100 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1 text-[10px]"> ⌘ </kbd>
            <span>+</span>
            <kbd class="bg-base-100 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1 text-[10px]"> ⇧ </kbd>
            <span>+</span>
            <kbd class="bg-base-100 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1 text-[10px]">Enter</kbd>
            <span class="text-base-content/60">Save & Continue</span>
          </div>

          <div class="flex items-center gap-1.5 text-xs">
            <kbd class="bg-base-100 border-base-300 inline-flex h-5 items-center justify-center rounded border px-1 text-[10px]">Esc</kbd>
            <span class="text-base-content/60">Cancel</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
