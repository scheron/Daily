<script setup lang="ts">
import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import BaseButton from "@/ui/base/BaseButton"

const props = defineProps<{value: string}>()

const {copyToClipboard, isCopied} = useCopyToClipboard()

function onCopy() {
  copyToClipboard(props.value)
}
</script>

<template>
  <div class="border-base-300 bg-base-100 flex min-w-0 items-center gap-2 rounded-lg border py-1 pl-2.5 pr-1">
    <code class="hide-scrollbar min-w-0 flex-1 select-text overflow-x-auto whitespace-nowrap py-1 font-mono text-xs">{{ value }}</code>
    <BaseButton
      :variant="isCopied ? 'success-ghost' : 'primary-ghost'"
      size="xs"
      :icon="isCopied ? 'check' : 'copy'"
      class="shrink-0"
      @click="onCopy"
    >
      {{ isCopied ? "Copied" : "Copy" }}
    </BaseButton>
  </div>
</template>
