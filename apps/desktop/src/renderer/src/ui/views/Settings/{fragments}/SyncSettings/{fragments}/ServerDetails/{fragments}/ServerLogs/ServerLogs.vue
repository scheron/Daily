<script setup lang="ts">
import {computed, ref} from "vue"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useSyncServerStore} from "@/stores/sync-server"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {formatLogEntry, formatLogText} from "./utils/formatLogEntry"

import type {RequestLogEntry} from "@daily/protocol"

const syncServerStore = useSyncServerStore()

const isOpen = ref(false)

const {copyToClipboard, isCopied} = useCopyToClipboard()

const lines = computed(() => syncServerStore.logs.map((entry) => ({entry, ...formatLogEntry(entry)})))

const issueText = computed(() => {
  const issue = syncServerStore.serverIssue
  if (!issue) return null

  return issue.kind === "outdated"
    ? "This server is too old to show logs. Update it to the latest version."
    : `Server entries are unavailable: ${issue.message}`
})

const copyVariant = computed(() => (isCopied.value ? "success-ghost" : "ghost-muted"))

function onToggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) syncServerStore.loadLogs()
}

function onCopy() {
  copyToClipboard(formatLogText(syncServerStore.logs))
}

function getHeadClasses() {
  return cn(
    "hover:bg-base-content/[2.5%] flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm transition-colors",
    [isOpen.value ? "text-accent" : "text-base-content"],
  )
}

function getChevronClasses() {
  return cn("size-3.5 shrink-0 transition-transform", [isOpen.value ? "text-accent rotate-180" : "text-base-content/40"])
}

function getLevelClasses(entry: RequestLogEntry) {
  return cn("font-semibold", {
    "text-info": entry.level === "info",
    "text-warning": entry.level === "warn",
    "text-error": entry.level === "error",
  })
}

function getStatusClasses(entry: RequestLogEntry) {
  return cn(entry.status !== null && entry.status < 400 ? "text-success" : "text-warning")
}
</script>

<template>
  <div class="mt-4">
    <button :class="getHeadClasses()" @click="onToggle">
      <span class="flex-1 font-medium">{{ isOpen ? "Hide logs" : "Show logs" }}</span>
      <BaseIcon name="chevron-down" :class="getChevronClasses()" />
    </button>

    <div v-if="isOpen" class="border-base-300 bg-base-200 mt-1 overflow-hidden rounded-[10px] border">
      <p v-if="syncServerStore.isLogsLoading" class="text-base-content/65 flex items-center justify-center gap-2 px-4 py-8 text-[13px]">
        <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
        Loading logs…
      </p>

      <template v-else>
        <div class="border-base-300 flex justify-end gap-1 border-b px-2 py-1.5">
          <BaseButton variant="ghost-muted" size="xs" icon="refresh" @click="syncServerStore.loadLogs">Refresh</BaseButton>
          <BaseButton :variant="copyVariant" size="xs" :icon="isCopied ? 'check' : 'copy'" @click="onCopy">
            {{ isCopied ? "Copied" : "Copy logs" }}
          </BaseButton>
        </div>

        <p v-if="issueText" class="text-warning border-base-300 border-b px-4 py-2.5 text-[13px]">{{ issueText }}</p>

        <p v-if="!lines.length" class="text-base-content/65 px-4 py-8 text-center text-[13px]">No requests logged yet.</p>

        <div v-else class="max-h-72 cursor-text select-text space-y-1 overflow-y-auto px-3 py-2.5 font-mono text-xs leading-normal">
          <div v-for="(line, index) in lines" :key="index" class="whitespace-pre-wrap break-words">
            <span class="text-base-content/55">{{ `${line.time} ` }}</span>
            <span :class="getLevelClasses(line.entry)">{{ `${line.level} ` }}</span>
            <span class="text-base-content/55">{{ `${line.source} ` }}</span>
            <span>{{ `${line.request} ` }}</span>
            <span :class="getStatusClasses(line.entry)">{{ `${line.status} ` }}</span>
            <span class="text-base-content/55">{{ line.duration }}</span>
            <span v-if="line.tail">{{ ` ${line.tail}` }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
