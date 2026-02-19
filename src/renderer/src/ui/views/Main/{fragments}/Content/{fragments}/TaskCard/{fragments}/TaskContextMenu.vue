<script setup lang="ts">
import {nextTick, onBeforeUnmount, ref, watch} from "vue"

import {ISODate} from "@shared/types/common"
import {useTasksStore} from "@/stores/tasks.store"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseCheckbox from "@/ui/base/BaseCheckbox.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Tag, TaskStatus} from "@shared/types/storage"

const props = withDefaults(
  defineProps<{
    open: boolean
    position: {
      x: number
      y: number
    }
    taskStatus: TaskStatus
    taskTags: Tag[]
    availableTags: Tag[]
  }>(),
  {
    open: false,
    position: () => ({x: 0, y: 0}),
    taskTags: () => [],
    availableTags: () => [],
  },
)

const emit = defineEmits<{
  "update:open": [value: boolean]
  edit: []
  "move-date": [date: ISODate]
  "status-change": [status: TaskStatus]
  copy: []
  "toggle-tag": [tag: Tag]
}>()

const MENU_WIDTH = 224
const SUBMENU_MAX_WIDTH = 280
const VIEWPORT_MARGIN = 12

const STATUS_ITEMS: Array<{value: TaskStatus; label: string; icon: IconName}> = [
  {value: "active", label: "Active", icon: "circle-pulse"},
  {value: "done", label: "Done", icon: "check-check"},
  {value: "discarded", label: "Discarded", icon: "x"},
]

const tasksStore = useTasksStore()

const menuRef = ref<HTMLElement | null>(null)
const isSubmenuOnLeft = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const activeSubmenu = ref<"move-date" | "status" | "tags" | null>(null)

let isListening = false

function isTagSelected(tagId: Tag["id"]) {
  return props.taskTags.some((tag) => tag.id === tagId)
}

function getSubmenuPositionClasses() {
  return isSubmenuOnLeft.value ? "right-[calc(100%+6px)]" : "left-[calc(100%+6px)]"
}

function openSubmenu(submenu: "move-date" | "status" | "tags") {
  activeSubmenu.value = submenu
}

function clearSubmenu() {
  activeSubmenu.value = null
}

function onSelectStatus(status: TaskStatus) {
  emit("status-change", status)
  hide()
}

function onCopy() {
  emit("copy")
  hide()
}

function onMoveDate(targetDate: ISODate) {
  emit("move-date", targetDate)
  hide()
}

function onEdit() {
  emit("edit")
  hide()
}

function hide() {
  clearSubmenu()
  emit("update:open", false)
}

function updatePosition() {
  if (!menuRef.value) return

  const rect = menuRef.value.getBoundingClientRect()
  const width = rect.width || MENU_WIDTH
  const height = rect.height || 0

  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)

  menuX.value = Math.min(Math.max(props.position.x, VIEWPORT_MARGIN), maxX)
  menuY.value = Math.min(Math.max(props.position.y, VIEWPORT_MARGIN), maxY)

  isSubmenuOnLeft.value = menuX.value + width + SUBMENU_MAX_WIDTH + 16 > window.innerWidth
}

function onWindowResize() {
  updatePosition()
}

function onWindowScroll(event: Event) {
  const target = event.target as Node | null
  if (target && menuRef.value?.contains(target)) return

  hide()
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") hide()
}

function onWindowPointerDown(event: PointerEvent) {
  if (!props.open) return

  const target = event.target as Node | null
  if (target && menuRef.value?.contains(target)) return

  hide()
}

function onWindowContextMenu(event: MouseEvent) {
  if (!props.open) return

  const target = event.target as Node | null
  if (target && menuRef.value?.contains(target)) return

  hide()
}

function addGlobalListeners() {
  if (isListening) return

  window.addEventListener("resize", onWindowResize)
  window.addEventListener("scroll", onWindowScroll, true)
  window.addEventListener("keydown", onWindowKeydown)
  window.addEventListener("pointerdown", onWindowPointerDown, true)
  window.addEventListener("contextmenu", onWindowContextMenu, true)

  isListening = true
}

function removeGlobalListeners() {
  if (!isListening) return

  window.removeEventListener("resize", onWindowResize)
  window.removeEventListener("scroll", onWindowScroll, true)
  window.removeEventListener("keydown", onWindowKeydown)
  window.removeEventListener("pointerdown", onWindowPointerDown, true)
  window.removeEventListener("contextmenu", onWindowContextMenu, true)

  isListening = false
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      addGlobalListeners()
      await nextTick()
      updatePosition()
      return
    }

    clearSubmenu()
    removeGlobalListeners()
  },
  {immediate: true},
)

watch(
  () => props.position,
  async () => {
    if (!props.open) return

    await nextTick()
    updatePosition()
  },
  {deep: true},
)

onBeforeUnmount(() => removeGlobalListeners())
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="bg-base-100/95 border-base-300 fixed z-90 min-w-48 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md"
      :style="{left: `${menuX}px`, top: `${menuY}px`}"
      @contextmenu.prevent
    >
      <button
        class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors"
        @mouseenter="clearSubmenu"
        @click="onEdit"
      >
        <BaseIcon name="pencil" class="text-base-content/70 size-4" />
        <span class="truncate">Edit</span>
      </button>

      <div class="relative" @mouseenter="openSubmenu('move-date')">
        <button
          class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors"
          :class="{'bg-base-content/10': activeSubmenu === 'move-date'}"
          @click="openSubmenu('move-date')"
        >
          <BaseIcon name="calendar" class="text-base-content/70 size-4" />
          <span class="truncate">Reschedule</span>
          <BaseIcon name="chevron-right" class="text-base-content/60 ml-auto size-4" />
        </button>

        <div
          v-if="activeSubmenu === 'move-date'"
          class="bg-base-100/95 border-base-300 absolute top-0 z-10 min-w-[280px] rounded-xl border p-3 shadow-2xl backdrop-blur-md"
          :class="getSubmenuPositionClasses()"
          @mouseenter="openSubmenu('move-date')"
        >
          <BaseCalendar
            mode="single"
            :days="tasksStore.days"
            :show-today-button="false"
            :initial-month="tasksStore.activeDay"
            size="sm"
            @select-date="onMoveDate"
          />
        </div>
      </div>

      <div class="relative" @mouseenter="openSubmenu('status')">
        <button
          class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors"
          :class="{'bg-base-content/10': activeSubmenu === 'status'}"
          @click="openSubmenu('status')"
        >
          <BaseIcon name="circle-pulse" class="text-base-content/70 size-4" />
          <span class="truncate">Status</span>
          <BaseIcon name="chevron-right" class="text-base-content/60 ml-auto size-4" />
        </button>

        <div
          v-if="activeSubmenu === 'status'"
          class="bg-base-100/95 border-base-300 absolute top-0 z-10 min-w-[220px] rounded-xl border p-1 shadow-2xl backdrop-blur-md"
          :class="getSubmenuPositionClasses()"
          @mouseenter="openSubmenu('status')"
        >
          <button
            v-for="statusItem in STATUS_ITEMS"
            :key="statusItem.value"
            class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors"
            @click="onSelectStatus(statusItem.value)"
          >
            <BaseIcon :name="statusItem.icon" class="text-base-content/70 size-4" />
            <span class="truncate">{{ statusItem.label }}</span>
            <BaseIcon name="check" class="text-accent ml-auto size-4" :class="{'invisible': taskStatus !== statusItem.value}" />
          </button>
        </div>
      </div>

      <button
        class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors"
        @mouseenter="clearSubmenu"
        @click="onCopy"
      >
        <BaseIcon name="copy" class="text-base-content/70 size-4" />
        <span class="truncate">Copy</span>
      </button>

      <div class="relative" @mouseenter="openSubmenu('tags')">
        <button
          class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors"
          :class="{'bg-base-content/10': activeSubmenu === 'tags'}"
          @click="openSubmenu('tags')"
        >
          <BaseIcon name="tags" class="text-base-content/70 size-4" />
          <span class="truncate">Tags</span>
          <BaseIcon name="chevron-right" class="text-base-content/60 ml-auto size-4" />
        </button>

        <div
          v-if="activeSubmenu === 'tags'"
          class="bg-base-100/95 border-base-300 absolute top-0 z-10 max-h-64 min-w-[220px] overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
          :class="getSubmenuPositionClasses()"
          @mouseenter="openSubmenu('tags')"
        >
          <button
            v-for="tag in availableTags"
            :key="tag.id"
            class="hover:bg-base-content/10 text-base-content/90 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors"
            @click.stop="emit('toggle-tag', tag)"
          >
            <BaseCheckbox :model-value="isTagSelected(tag.id)" size="sm" class="pointer-events-none shrink-0" />
            <span class="size-2.5 shrink-0 rounded-full" :style="{backgroundColor: tag.color}" />
            <span class="truncate">#{{ tag.name }}</span>
          </button>

          <div v-if="!availableTags.length" class="text-base-content/60 px-3 py-2 text-sm">No tags available</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
