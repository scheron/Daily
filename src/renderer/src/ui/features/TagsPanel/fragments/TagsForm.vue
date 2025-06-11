<script setup lang="ts">
import {onMounted, ref, useTemplateRef} from "vue"
import {toast} from "vue-sonner"

import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import ColorPicker from "@/ui/misc/ColorPicker.vue"

import type {Tag} from "@/types/tasks"

const COLORS = ["#D01C55", "#015A6F", "#35A4D9", "#F5A623", "#7B61FF", "#615FFF", "#00B8A9", "#F86624"]

const props = withDefaults(defineProps<{tags: Tag[]}>(), {tags: () => []})
const emit = defineEmits<{submit: [name: string, color: string]; close: []}>()

const newTagName = ref("")
const newTagColor = ref("#D01C55")
const isCreating = ref(false)

const inputRef = useTemplateRef<HTMLInputElement>("input")

async function createTag() {
  if (!newTagName.value.trim()) return

  if (props.tags.some((tag) => tag.name === newTagName.value.trim())) {
    toast.error("Tag with this name already exists")
    return
  }

  emit("submit", newTagName.value.trim(), newTagColor.value)
  emit("close")

  newTagName.value = ""
  isCreating.value = false
}

function onColorSelect(color: string) {
  newTagColor.value = color
}

onMounted(() => inputRef.value?.focus())
</script>

<template>
  <form class="flex flex-col px-4 pb-6 pt-2 gap-2" @submit.prevent="createTag">
    <div class="flex items-center justify-between w-full">
      <h3 class="text-base-content/80 font-semibold text-sm flex-1">Create Tag</h3>

      <div class="flex items-center gap-2">
        <BaseButton type="button" variant="ghost" size="sm" class="py-0.5" icon-class="size-4" icon="undo" @click="emit('close')" />
        <BaseButton
          type="button"
          icon="plus"
          size="sm"
          class="py-0.5 px-4 bg-accent/20 hover:bg-accent/30"
          :disabled="!newTagName.trim()"
          @click="createTag"
        />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-base-content/50 text-sm">Name:</span>
      <input
        ref="input"
        v-model="newTagName"
        type="text"
        maxlength="20"
        placeholder="Tag name"
        class="flex-1 text-sm px-3 py-1.5 rounded-lg bg-base-100 border border-base-300 focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50"
      />
    </div>

    <div class="flex items-center gap-2">
      <span class="text-base-content/50 text-sm">Color:</span>
      <div class="flex items-center gap-1 flex-1">
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
              class="size-5 rounded-full overflow-hidden p-0 border-none relative"
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
