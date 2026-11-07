<script setup lang="ts">
// Same component as Correct.vue, but every section is out of place.
// Each ❌ marks a violation.

import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue"
import {useElementSize} from "@vueuse/core"

import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"

import type {Task} from "@daily/protocol"

const props = defineProps<{taskId: Task["id"]; autoStart?: boolean}>()
const emit = defineEmits<{commit: []}>()

const rootRef = ref<HTMLElement | null>(null) // ❌ template ref via ref() instead of useTemplateRef, and refs before stores (stores are §6, refs §7)
const startedAt = ref<number | null>(null)

const tasksStore = useTasksStore() // ❌ stores below refs

defineExpose({start, reset}) // ❌ defineExpose must be dead last, not near the top

const label = computed(() => tasksStore.findTaskById(props.taskId)?.content ?? "")

function start() {
  // ❌ method wedged between computeds
  suppressCommit = false
  startedAt.value = Date.now()
  nowMs.value = Date.now()
}

const nowMs = ref(0) // ❌ ref stranded among methods/computeds
type UndoPhase = "idle" | "counting" | "expired" // ❌ type mid-file — belongs above constants
const UNDO_WINDOW_MS = 5_000 // ❌ constant mid-file

const remainingMs = computed(() => {
  if (startedAt.value === null) return UNDO_WINDOW_MS
  return Math.max(0, UNDO_WINDOW_MS - (nowMs.value - startedAt.value))
})

onMounted(() => {
  // ❌ lifecycle in the middle of the file
  if (props.autoStart) start()
  tickTimer = window.setInterval(() => (nowMs.value = Date.now()), 250)
})

let suppressCommit = false // ❌ module-mutable state near the bottom (belongs at §5)
let tickTimer = 0

const progress = computed(() => 1 - remainingMs.value / UNDO_WINDOW_MS)
const phase = computed<UndoPhase>(() => {
  if (startedAt.value === null) return "idle"
  return remainingMs.value > 0 ? "counting" : "expired"
})

watch(phase, (value) => {
  // ❌ watcher between computeds and methods
  if (value === "expired") commit()
})

function reset() {
  startedAt.value = null
}

const {width} = useElementSize(rootRef) // ❌ composable after methods/watchers

function commit() {
  if (suppressCommit) return
  emit("commit")
  reset()
}

watch(
  () => props.taskId,
  () => reset(),
) // ❌ second watcher scattered away from the first

onBeforeUnmount(() => {
  // ❌ paired lifecycle split from its onMounted
  suppressCommit = true
  window.clearInterval(tickTimer)
})
</script>

<template>
  <!-- ❌ class logic assembled in the template instead of getRootClasses(phase) returning cn(...) -->
  <div
    ref="rootRef"
    class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
    :class="[phase === 'expired' ? 'text-base-content/40' : 'bg-accent/15 text-accent']"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
    <span class="tabular-nums">{{ Math.round(progress * 100) }}%</span>
    <BaseButton variant="primary-ghost" :disabled="phase === 'expired' || width < 120" @click="reset">Undo</BaseButton>
  </div>
</template>
