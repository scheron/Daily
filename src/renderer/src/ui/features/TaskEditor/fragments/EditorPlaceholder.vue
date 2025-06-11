<script setup lang="ts">
import {useDevice} from "@/composables/useDevice"
import BaseIcon from "@/ui/base/BaseIcon"

const {isMacOS} = useDevice()
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-50 mx-4 flex items-center justify-center">
    <div class="text-base-content border-base-300 bg-base-100 flex min-w-80 flex-col items-center gap-2 rounded-lg border p-4 text-center">
      <BaseIcon name="markdown" class="size-8" />

      <p class="text-base-content/70 text-sm">You can use Markdown</p>

      <div class="border-base-300 my-2 flex w-full justify-around gap-4 border-t" />

      <table class="w-full table-auto text-sm">
        <tbody class="text-base-content/80">
          <tr>
            <td class="p-1 text-start">
              <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5">Enter</kbd>
            </td>
            <td class="text-start">Save & Close</td>
          </tr>
          <tr>
            <td class="p-1 text-start">
              <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5">
                {{ isMacOS ? "⌘" : "Ctrl" }}
              </kbd>
              +
              <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5">Enter</kbd>
            </td>
            <td class="text-start">Save & Continue</td>
          </tr>
          <tr>
            <td class="p-1 text-start">
              <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5">Esc</kbd>
            </td>
            <td class="text-start">Cancel</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
