<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef} from "vue"
import {toast} from "vue-sonner"

import type {Tag} from "@/types/tasks"

import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import ColorPicker from "@/ui/common/pickers/ColorPicker.vue"
import EmojiPicker from "@/ui/common/pickers/EmojiPicker.vue"

import TagsInput from "./TagsInput.vue"

const COLORS = ["#D01C55", "#015A6F", "#35A4D9", "#F5A623", "#7B61FF", "#615FFF", "#00B8A9", "#F86624"]

const props = withDefaults(defineProps<{tags: Tag[]}>(), {tags: () => []})
const emit = defineEmits<{submit: [name: string, color: string, emoji?: string]; close: []}>()

const newTagName = ref("")
const newTagColor = ref("#D01C55")
const newTagEmoji = ref<string>("")
const isCreating = ref(false)

const inputRef = useTemplateRef<HTMLInputElement>("input")

const tagValidation = computed(() => {
  const name = newTagName.value.trim()

  if (!name) return {isValid: false, error: ""}
  if (name.includes(" ")) return {isValid: false, error: ""}
  return {isValid: true, error: ""}
})

const isTagValid = computed(() => tagValidation.value.isValid)

async function createTag() {
  if (!isTagValid.value) return

  const tagName = newTagName.value.trim()

  if (props.tags.some((tag) => tag.name === tagName)) {
    toast.error("Tag with this name already exists")
    return
  }

  emit("submit", tagName, newTagColor.value, newTagEmoji.value)
  emit("close")

  newTagName.value = ""
  newTagEmoji.value = ""
  isCreating.value = false
}

function onColorSelect(color: string) {
  newTagColor.value = color
}

function onEmojiSelect(emoji?: string) {
  newTagEmoji.value = emoji ?? ""
}

onMounted(() => inputRef.value?.focus())
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="createTag">
    <div class="mb-2 flex w-full items-center justify-between">
      <h3 class="text-base-content/80 flex-1 text-sm font-semibold">Create Tag</h3>

      <div class="flex items-center gap-2">
        <BaseButton type="button" variant="ghost" size="sm" class="" icon-class="size-4" icon="undo" @click="emit('close')" />
        <BaseButton type="button" icon="plus" size="sm" class="bg-accent/20 hover:bg-accent/30 px-4" :disabled="!isTagValid" @click="createTag" />
      </div>
    </div>

    <div class="mb-3 flex items-center gap-2">
      <span class="text-base-content/50 text-sm">Name:</span>

      <BasePopup triggerClass="flex size-8 items-center justify-center" hide-header content-class="overflow-hidden p-1" position="center">
        <template #trigger="{toggle}">
          <BaseButton variant="outline" type="button" class="size-full" @click="toggle">
            <span v-if="newTagEmoji" class="text-lg">{{ newTagEmoji }}</span>
            <span v-else class="text-lg">#</span>
          </BaseButton>
        </template>

        <template #default="{hide}">
          <!-- prettier-ignore -->
          <EmojiPicker
            :selected-emoji="newTagEmoji"
            @selected="(emoji) => { onEmojiSelect(emoji); hide() }"
            @clear="() => { onEmojiSelect(); hide() }"
          />
        </template>
      </BasePopup>

      <div class="flex-1">
        <TagsInput v-model="newTagName" />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-base-content/50 text-sm">Color:</span>
      <div class="flex flex-1 items-center gap-1">
        <BaseButton
          v-for="color in COLORS"
          :key="color"
          size="sm"
          class="size-5 rounded-full"
          type="button"
          :class="newTagColor === color ? 'scale-110 opacity-100' : 'opacity-60'"
          :style="{backgroundColor: color}"
          @click="onColorSelect(color)"
        />

        <BasePopup triggerClass="ml-auto flex items-center justify-center" title="Pick color" position="center">
          <template #trigger="{toggle}">
            <BaseButton
              class="relative size-5 overflow-hidden rounded-full border-none p-0"
              size="sm"
              :class="!COLORS.includes(newTagColor) ? 'scale-110' : ''"
              type="button"
              @click="toggle"
            >
              <div class="absolute inset-0 bg-[conic-gradient(from_0deg,red,yellow,lime,aqua,blue,magenta,red)]" />
              <div v-if="!COLORS.includes(newTagColor)" class="absolute inset-0.5 rounded-full" :style="{backgroundColor: newTagColor}" />
            </BaseButton>
          </template>

          <template #default="{hide}">
            <!-- prettier-ignore -->
            <ColorPicker @selected="(c) => { onColorSelect(c); hide() }" />
          </template>
        </BasePopup>
      </div>
    </div>
  </form>
</template>
