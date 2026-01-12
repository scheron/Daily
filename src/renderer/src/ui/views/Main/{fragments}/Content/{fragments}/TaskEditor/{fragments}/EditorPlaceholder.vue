<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
</script>

<template>
  <div class="pointer-events-auto absolute right-4 bottom-4 z-30">
    <div
      v-tooltip="{
        content: `
          <div class='text-base-content flex min-w-80 flex-col items-center gap-2 p-4 text-center'>
            <div class='flex items-center gap-2'>
              <svg class='size-6' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
                <path d='M4 6h16M4 12h16M4 18h16'/>
              </svg>
              <p class='text-base-content/70 text-sm font-semibold'>You can use Markdown</p>
            </div>
            <div class='border-base-300 my-2 flex w-full justify-around gap-4 border-t' />
            <table class='w-full table-auto text-sm'>
              <tbody class='text-base-content/80'>
                <tr>
                  <td class='p-1 text-start'>
                    <kbd class='bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5'> ⌘ </kbd>
                    +
                    <kbd class='bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5'>Enter</kbd>
                  </td>
                  <td class='text-start'>Save & Close</td>
                </tr>
                <tr>
                  <td class='p-1 text-start'>
                    <kbd class='bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5'> ⌘ </kbd>
                    +
                    <kbd class='bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5'> ⇧ </kbd>
                    +
                    <kbd class='bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5'>Enter</kbd>
                  </td>
                  <td class='text-start'>Save & Continue</td>
                </tr>
                <tr>
                  <td class='p-1 text-start'>
                    <kbd class='bg-base-100 border-base-300 inline-flex h-6 items-center justify-start rounded border px-1.5'>Esc</kbd>
                  </td>
                  <td class='text-start'>Cancel</td>
                </tr>
              </tbody>
            </table>
          </div>
        `,
        placement: 'left',
        html: true,
        theme: 'tooltip',
      }"
      class="text-base-content/50 hover:text-base-content/70 bg-base-100/80 hover:bg-base-100 border-base-300 flex size-10 cursor-pointer items-center justify-center rounded-full border shadow-lg transition-all duration-200 hover:scale-110"
    >
      <BaseIcon name="markdown" class="size-5" />
    </div>
  </div>
</template>
