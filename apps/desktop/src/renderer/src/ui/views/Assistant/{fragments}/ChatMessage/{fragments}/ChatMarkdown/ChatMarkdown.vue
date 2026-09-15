<script setup lang="ts">
import {computed} from "vue"

import {renderChatMarkdown} from "./utils/renderChatMarkdown"

const props = defineProps<{text?: string}>()

const rendered = computed(() => renderChatMarkdown(props.text ?? ""))
</script>

<template>
  <div class="prose prose-sm chat-markdown" v-html="rendered" />
</template>

<style>
@import "highlight.js/styles/github-dark.css";

.chat-markdown {
  word-wrap: break-word;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.chat-markdown pre {
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  overflow-x: auto;
  max-width: 100%;
}
.chat-markdown table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
.chat-markdown code {
  font-size: 0.85em;
}
</style>
