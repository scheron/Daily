<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef} from "vue"
import {toast} from "vue-sonner"

import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import TagsInput from "@/ui/common/inputs/TagsInput.vue"
import ColorPicker from "@/ui/common/pickers/ColorPicker.vue"

import type {Tag} from "@shared/types/storage"

const COLORS = ["#D01C55", "#015A6F", "#35A4D9", "#F5A623", "#7B61FF", "#00B8A9", "#F86624", "#10B981", "#EAB308", "#A855F7"]

const props = withDefaults(defineProps<{tags: Tag[]}>(), {tags: () => []})
const emit = defineEmits<{submit: [name: string, color: string]}>()

const newTagName = ref("")
const newTagColor = ref("#D01C55")

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

  /** @deprecated Remove in future */
  if (props.tags.some((tag) => tag.name === tagName)) {
    toast.error("Tag with this name already exists")
    return
  }

  emit("submit", tagName, newTagColor.value)

  newTagName.value = ""
  newTagColor.value = COLORS[0]
}

function onColorSelect(color: string) {
  newTagColor.value = color
}

onMounted(() => inputRef.value?.focus())
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="createTag">
    <div class="relative flex items-center">
      <span class="text-base-content/40 pointer-events-none absolute left-3 text-sm">#</span>
      <TagsInput v-model="newTagName" class="pr-16 pl-6" />
      <div class="absolute right-1 flex items-center gap-1">
        <BaseButton
          v-if="newTagName"
          type="button"
          size="sm"
          variant="ghost"
          icon="x-mark"
          icon-class="size-3.5"
          class="opacity-50 hover:opacity-100"
          @click="newTagName = ''"
        />
        <BaseButton type="submit" size="sm" variant="ghost" icon="plus" icon-class="size-4" :disabled="!isTagValid" />
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <button
        v-for="color in COLORS"
        :key="color"
        type="button"
        class="size-5 rounded-full transition-opacity hover:opacity-100"
        :class="newTagColor === color ? 'opacity-100' : 'opacity-40'"
        :style="{backgroundColor: color}"
        @click="onColorSelect(color)"
      />

      <BasePopup triggerClass="flex items-center justify-center" hide-header content-class="p-2" position="center">
        <template #trigger="{toggle}">
          <button
            type="button"
            class="relative size-5 overflow-hidden rounded-full transition-opacity hover:opacity-100"
            :class="!COLORS.includes(newTagColor) ? 'opacity-100' : 'opacity-40'"
            @click="toggle"
          >
            <div class="absolute inset-0 bg-[conic-gradient(from_0deg,red,yellow,lime,aqua,blue,magenta,red)]" />
            <div v-if="!COLORS.includes(newTagColor)" class="absolute inset-0.5 rounded-full" :style="{backgroundColor: newTagColor}" />
          </button>
        </template>

        <template #default="{hide}">
          <ColorPicker
            @selected="
              (c) => {
                onColorSelect(c)
                hide()
              }
            "
          />
        </template>
      </BasePopup>
    </div>
  </form>
</template>
