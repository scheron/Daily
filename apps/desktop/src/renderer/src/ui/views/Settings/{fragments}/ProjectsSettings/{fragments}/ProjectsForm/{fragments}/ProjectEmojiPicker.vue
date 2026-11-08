<script setup lang="ts">
import {nextTick, onBeforeUnmount, ref, useId, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BasePopup from "@/ui/base/BasePopup.vue"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"

import type {Picker} from "emoji-mart"

const props = defineProps<{modelValue: string | null}>()
const emit = defineEmits<{"update:modelValue": [emoji: string | null]}>()

let picker: (Picker & HTMLElement) | null = null

const triggerRef = useTemplateRef<HTMLElement>("trigger")
const dialogRef = useTemplateRef<HTMLElement>("dialog")
const pickerHostRef = useTemplateRef<HTMLElement>("pickerHost")
const loadFailed = ref(false)

const dialogId = useId()

async function open(show: () => void, hide: () => void) {
  loadFailed.value = false
  show()
  await nextTick()
  dialogRef.value?.focus()
  await loadPicker(hide)
}

async function loadPicker(hide: () => void) {
  loadFailed.value = false
  const host = pickerHostRef.value
  if (!host) return
  try {
    const [{Picker}, {default: data}] = await Promise.all([import("emoji-mart"), import("@emoji-mart/data")])
    if (!host.isConnected || pickerHostRef.value !== host) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    picker = new Picker({
      data,
      set: "native",
      emojiVersion: 15,
      perLine: 6,
      dynamicWidth: false,
      emojiButtonSize: rem * 2,
      emojiSize: rem * 1.125,
      emojiButtonRadius: "0.5rem",
      navPosition: "none",
      previewPosition: "none",
      searchPosition: "sticky",
      skinTonePosition: "search",
      maxFrequentRows: 0,
      autoFocus: true,
      onEmojiSelect: ({native}: {native: string}) => select(native, hide),
    }) as Picker & HTMLElement
    const style = document.createElement("style")
    style.textContent = `
      :host {
        width: 100%; height: 14rem; min-height: 0;
        --font-family: var(--font-sans); --font-size: 0.875rem;
        --border-radius: 0; --shadow: none;
        --color-border: var(--c-base-200); --color-border-over: var(--c-base-300);
      }
      #root {
        width: 100% !important; min-height: 0; background: var(--c-base-100);
        --padding: 0.25rem; --sidebar-width: 0.5rem;
        --color-a: var(--c-base-content);
        --color-b: color-mix(in srgb, var(--c-base-content) 70%, transparent);
        --color-c: color-mix(in srgb, var(--c-base-content) 60%, transparent);
      }
      :host, #root, input, button { color: var(--c-base-content); }
      .scroll { min-height: 0; }
      .scroll > div { width: 100% !important; }
      .sticky, .menu { background: var(--c-base-100); backdrop-filter: none; }
      .sticky { font-size: 0.75rem; padding-top: 0.5rem; padding-bottom: 0.25rem; }
      .search input[type="search"] { padding-top: 0.5rem; padding-bottom: 0.5rem; border-radius: 0.5rem; }
      .search input[type="search"]:focus { background: var(--c-base-100); box-shadow: inset 0 0 0 1px var(--c-accent); }
      .search .icon { color: var(--c-base-content); }
      button:focus-visible, .menu input[type="radio"]:focus-visible + .option { outline: 2px solid var(--c-accent); outline-offset: -2px; }
      .menu input[type="radio"]:checked + .option { box-shadow: inset 0 0 0 2px var(--c-accent); }
      .option:hover { background: var(--c-base-300); color: var(--c-base-content); }
      .scroll::-webkit-scrollbar { width: 0.5rem; background: var(--c-base-100); }
      .scroll::-webkit-scrollbar-thumb { border: 0; background: var(--c-base-300); border-radius: 0.5rem; }
      .scroll::-webkit-scrollbar-thumb:hover { background: var(--c-accent) !important; }
      ::selection { background: var(--c-editor-selection); }
    `
    picker.shadowRoot?.append(style)
    host.replaceChildren(picker)
  } catch {
    if (host.isConnected && pickerHostRef.value === host) loadFailed.value = true
  }
}

function disposePicker() {
  picker?.remove()
  picker = null
}

function close(hide: () => void) {
  hide()
  triggerRef.value?.querySelector("button")?.focus()
}

function select(emoji: string | null, hide: () => void) {
  emit("update:modelValue", emoji)
  close(hide)
}

function onKeydown(event: KeyboardEvent, hide: () => void) {
  const active = event.composedPath()[0]
  if (active instanceof HTMLInputElement && active.matches('input[name="skin-tone"]') && ["Enter", "Space", "Tab"].includes(event.code)) {
    picker?.shadowRoot?.querySelector<HTMLButtonElement>(".skin-tone-button")?.focus()
  }
  if (event.key === "Escape") {
    event.preventDefault()
    event.stopPropagation()
    close(hide)
  }
  if (event.key === "Tab") {
    const controls = [
      ...Array.from(
        picker?.shadowRoot?.querySelectorAll<HTMLElement>('input:not(:disabled):not([type="radio"]), button:not(:disabled):not([tabindex="-1"])') ??
          [],
      ),
      ...Array.from(dialogRef.value?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []),
    ]
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}

onBeforeUnmount(disposePicker)
</script>

<template>
  <BasePopup hide-header container-class="w-64 max-h-none overflow-hidden p-3" trigger-class="shrink-0" @close="disposePicker">
    <template #trigger="{show, hide, isOpen}">
      <span ref="trigger">
        <BaseButton
          variant="ghost"
          size="xs"
          aria-label="Choose project emoji"
          aria-haspopup="dialog"
          :aria-expanded="isOpen"
          :aria-controls="isOpen ? dialogId : undefined"
          @click="isOpen ? close(hide) : open(show, hide)"
          @keydown.down.prevent="open(show, hide)"
          @keydown.esc.stop.prevent="isOpen && close(hide)"
        >
          <template #icon="{class: iconClass}">
            <ProjectIcon :project="{id: 'draft', emoji: props.modelValue}" :class="iconClass" />
          </template>
        </BaseButton>
      </span>
    </template>
    <template #default="{hide}">
      <div
        :id="dialogId"
        ref="dialog"
        role="dialog"
        tabindex="-1"
        aria-label="Project emoji"
        @keydown.capture="onKeydown($event, hide)"
        @keyup.esc.stop
      >
        <div ref="pickerHost" class="h-56">
          <div v-if="loadFailed" class="flex h-full flex-col items-center justify-center gap-2 text-sm" role="status">
            <span>Could not load emojis.</span>
            <BaseButton variant="ghost-muted" size="sm" @click="loadPicker(hide)">Try again</BaseButton>
          </div>
        </div>
        <BaseButton variant="ghost-muted" size="sm" class="mt-2 w-full" aria-label="Use default project icon" @click="select(null, hide)"
          >Use default icon</BaseButton
        >
      </div>
    </template>
  </BasePopup>
</template>
