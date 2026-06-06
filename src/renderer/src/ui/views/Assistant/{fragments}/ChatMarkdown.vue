<script lang="ts">
import hljs from "highlight.js"
import MarkdownIt from "markdown-it"

// Module-scoped — one instance shared across all ChatMarkdown component instances
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight: (str: string, lang: string): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, {language: lang, ignoreIllegals: true}).value}</code></pre>`
      } catch {
        // fall through
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})
</script>

<script setup lang="ts">
import {computed} from "vue"

const props = defineProps<{text?: string}>()

const rendered = computed(() => md.render(props.text ?? ""))
</script>

<template>
  <div class="prose prose-sm chat-markdown" v-html="rendered" />
</template>

<style>
@import "highlight.js/styles/github-dark.css";

.chat-markdown {
  word-wrap: break-word;
}
.chat-markdown pre {
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  overflow-x: auto;
}
.chat-markdown code {
  font-size: 0.85em;
}
</style>
