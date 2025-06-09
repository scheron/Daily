<script setup lang="ts">
import {useDevice} from "@/composables/useDevice"

const {isMacOS} = useDevice()
</script>

<template>
  <table class="table-auto text-sm select-none">
    <tbody class="text-base-content/80">
      <tr>
        <td class="p-1">
          <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-center rounded border px-1.5">
            {{ isMacOS ? "⌘" : "Ctrl" }}
          </kbd>
          +
          <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-center rounded border px-1.5">N</kbd>
        </td>
        <td>Create a new task</td>
      </tr>
      <tr>
        <td class="p-1">
          <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-center rounded border px-1.5">
            {{ isMacOS ? "⌘" : "Ctrl" }}
          </kbd>
          +
          <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-center rounded border px-1.5">I</kbd>
        </td>
        <td>Toggle settings</td>
      </tr>
      <tr>
        <td class="p-1">
          <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-center rounded border px-1.5">
            {{ isMacOS ? "⌘" : "Ctrl" }}
          </kbd>
          +
          <kbd class="bg-base-100 border-base-300 inline-flex h-6 items-center justify-center rounded border px-1.5">E</kbd>
        </td>
        <td>Export tasks</td>
      </tr>
    </tbody>
  </table>
</template>
