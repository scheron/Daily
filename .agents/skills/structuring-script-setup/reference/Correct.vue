<script setup lang="ts">
// The `// N. section` labels are teaching-only — real components omit them and
// rely on the blank line between sections. See SKILL.md.

// 1. imports
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch} from "vue"
import {useElementSize, useEventListener} from "@vueuse/core"

import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task} from "@daily/protocol"

// 2. types
type UndoPhase = "idle" | "counting" | "expired"

// 3. constants
const UNDO_WINDOW_MS = 5_000

// 4. contract
const props = defineProps<{taskId: Task["id"]; autoStart?: boolean}>()
const emit = defineEmits<{commit: []}>()
const open = defineModel<boolean>("open", {required: true})

// 5. instance state
let suppressCommit = false
let tickTimer = 0

// 6. stores
const tasksStore = useTasksStore()

// 7. refs
const panelRef = useTemplateRef("panel")
const startedAt = ref<number | null>(null)
const nowMs = ref(0)

// 8. computeds
const label = computed(() => tasksStore.findTaskById(props.taskId)?.content ?? "")
const remainingMs = computed(() => {
  if (startedAt.value === null) return UNDO_WINDOW_MS
  return Math.max(0, UNDO_WINDOW_MS - (nowMs.value - startedAt.value))
})
const progress = computed(() => 1 - remainingMs.value / UNDO_WINDOW_MS)
const phase = computed<UndoPhase>(() => {
  if (startedAt.value === null) return "idle"
  return remainingMs.value > 0 ? "counting" : "expired"
})
const panelClass = computed(() =>
  cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm", [phase.value === "expired" ? "text-base-content/40" : "bg-accent/15 text-accent"]),
)

// 9. composables
const {width} = useElementSize(panelRef)
useEventListener(document, "visibilitychange", () => (nowMs.value = Date.now()))

// 10. methods
function start() {
  suppressCommit = false
  startedAt.value = Date.now()
  nowMs.value = Date.now()
  panelRef.value?.scrollIntoView({block: "nearest"})
}

function reset() {
  startedAt.value = null
}

function undo() {
  reset()
  open.value = false
}

function commit() {
  if (suppressCommit) return
  emit("commit")
  reset()
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && phase.value === "counting") undo()
}

// 11. watchers and subscriptions
watch(phase, (value) => {
  if (value === "expired") commit()
})

watch(
  () => props.taskId,
  () => panelRef.value?.scrollIntoView({block: "nearest"}),
)

useEventListener(window, "keydown", onKeydown)

// 12. lifecycle
onMounted(() => {
  if (props.autoStart) start()
  tickTimer = window.setInterval(() => (nowMs.value = Date.now()), 250)
})

onBeforeUnmount(() => {
  suppressCommit = true
  window.clearInterval(tickTimer)
})

// 13. defineExpose
defineExpose({start, reset})
</script>

<template>
  <div v-if="open" ref="panel" role="status" :class="panelClass">
    <span class="min-w-0 truncate">{{ label }}</span>
    <span class="tabular-nums">{{ Math.round(progress * 100) }}%</span>
    <BaseButton variant="primary-ghost" :disabled="phase !== 'counting' || width < 120" @click="undo">Undo</BaseButton>
  </div>
</template>
