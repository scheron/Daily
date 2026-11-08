<script setup lang="ts">
import {onMounted, ref, useTemplateRef} from "vue"

import {ALLOWED_LINK_URL_REGEX, URL_SCHEME_REGEX} from "@/constants/regex"
import BaseButton from "@/ui/base/BaseButton"

import type {Editor} from "@tiptap/vue-3"

const props = defineProps<{editor: Editor}>()
const emit = defineEmits<{close: []}>()

const isExisting = props.editor.isActive("link")
const selection = props.editor.state.selection
const hasSelection = !selection.empty
const href = ref<string>(props.editor.getAttributes("link").href ?? "")
const label = ref("")
const error = ref("")
const dialogRef = useTemplateRef<HTMLDialogElement>("dialog")

function onSave() {
  const input = href.value.trim()
  const url = URL_SCHEME_REGEX.test(input) ? input : `https://${input}`
  if (!input || !ALLOWED_LINK_URL_REGEX.test(url)) {
    error.value = "Enter a valid web or email address."
    return
  }

  const chain = props.editor.chain().setTextSelection({from: selection.from, to: selection.to})
  if (isExisting) {
    chain.extendMarkRange("link").setLink({href: url}).run()
  } else if (hasSelection) {
    chain.setLink({href: url}).run()
  } else {
    chain.insertContent({type: "text", text: label.value.trim() || input, marks: [{type: "link", attrs: {href: url}}]}).run()
  }
  emit("close")
}

function onRemove() {
  props.editor.chain().setTextSelection({from: selection.from, to: selection.to}).extendMarkRange("link").unsetLink().run()
  emit("close")
}

onMounted(() => dialogRef.value?.showModal?.())
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="bg-base-100 border-base-300 text-base-content m-auto w-[min(24rem,calc(100%-2rem))] rounded-lg border p-4 shadow-lg backdrop:bg-black/30"
      aria-labelledby="editor-link-title"
      @cancel.stop.prevent="emit('close')"
      @keydown.esc.stop
    >
      <form class="flex flex-col gap-3" @submit.prevent="onSave">
        <h2 id="editor-link-title" class="font-semibold">{{ isExisting ? "Edit link" : "Insert link" }}</h2>
        <label class="flex flex-col gap-1 text-sm">
          Address
          <input v-model="href" class="border-base-300 rounded-md border px-2 py-1" placeholder="https://example.com" autofocus />
        </label>
        <label v-if="!hasSelection && !isExisting" class="flex flex-col gap-1 text-sm">
          Text
          <input v-model="label" class="border-base-300 rounded-md border px-2 py-1" placeholder="Same as the address" />
        </label>
        <p v-if="error" class="text-error text-sm" role="alert">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <BaseButton v-if="isExisting" type="button" variant="ghost" @click="onRemove">Remove</BaseButton>
          <BaseButton type="button" variant="ghost" @click="emit('close')">Cancel</BaseButton>
          <BaseButton type="submit">Apply</BaseButton>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>
