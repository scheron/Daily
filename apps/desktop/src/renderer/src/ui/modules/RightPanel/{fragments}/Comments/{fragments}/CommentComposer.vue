<script setup lang="ts">
import {ref} from "vue"

import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKeys"
import CommentField from "./CommentField.vue"

const emit = defineEmits<{submit: [string]}>()

const isExpanded = ref(false)
const draft = ref("")

function expand() {
  isExpanded.value = true
}

function collapse() {
  isExpanded.value = false
  draft.value = ""
}

function submit() {
  const content = draft.value.trim()
  if (content) emit("submit", content)
  collapse()
}
</script>

<template>
  <div class="border-base-300 shrink-0 border-t px-4 pt-2 pb-2.5">
    <button
      v-if="!isExpanded"
      type="button"
      class="border-base-300 bg-base-100 text-base-content/50 hover:border-base-content/20 focus-visible-accent flex h-8 w-full cursor-text items-center rounded-lg border px-3 text-left text-sm transition-colors"
      @click="expand"
    >
      Write a comment…
    </button>

    <CommentField
      v-else
      v-model="draft"
      placeholder="Write a comment…"
      submit-text="Comment"
      submit-icon="send"
      :hint-key="toShortcutKeys('comments:submit')"
      hint-text="to send"
      @submit="submit"
      @cancel="collapse"
    />
  </div>
</template>
