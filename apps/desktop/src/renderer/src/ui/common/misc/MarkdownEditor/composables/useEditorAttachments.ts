import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {useEventListener} from "@vueuse/core"

import {uploadImageFile} from "../utils/uploadImageFile"

import type {Task} from "@daily/protocol"
import type {Editor} from "@tiptap/vue-3"
import type {Ref} from "vue"

type AttachmentOptions = {
  enabled: Readonly<Ref<boolean>>
  disabled: Readonly<Ref<boolean>>
  readonly: Readonly<Ref<boolean>>
  contentKey: Readonly<Ref<Task["id"] | undefined>>
}

export function useEditorAttachments(
  containerRef: Readonly<Ref<HTMLElement | null>>,
  editor: Readonly<Ref<Editor | null>>,
  {enabled, disabled, readonly: isReadonly, contentKey}: AttachmentOptions,
) {
  const dragging = ref(false)

  const isDraggingOver = computed(() => dragging.value && enabled.value && !isReadonly.value)

  useEventListener(containerRef, ["dragenter", "dragover", "drop", "paste"], blockReadonlyInteraction, {capture: true})
  useEventListener(containerRef, "paste", onPaste, {capture: true})
  useEventListener(containerRef, "dragover", onDragOver, {capture: true})
  useEventListener(containerRef, "dragleave", onDragLeave)
  useEventListener(containerRef, "drop", onDrop, {capture: true})

  function blockReadonlyInteraction(event: Event) {
    if (!isReadonly.value) return
    dragging.value = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onPaste(event: ClipboardEvent) {
    const clipboard = event.clipboardData
    const instance = editor.value
    if (!clipboard || !instance) return

    event.preventDefault()
    event.stopPropagation()

    if (enabled.value) {
      const image = getClipboardImage(clipboard)
      if (image) {
        void insertImages([image], instance)
        return
      }
    }

    const text = clipboard.getData("text/plain")
    if (!text) return

    const blocks = text.trim() && !isLiteralTextBlock(instance) ? instance.markdown?.parse(text).content : undefined
    if (!blocks?.length) {
      instance.view.dispatch(instance.state.tr.insertText(text))
      return
    }

    const [first] = blocks
    const content = blocks.length === 1 && first.type === "paragraph" && first.content?.length ? first.content : blocks
    instance.commands.insertContent(content)

    function getClipboardImage(data: DataTransfer) {
      for (const item of Array.from(data.items ?? [])) {
        if (!item.type.startsWith("image/")) continue
        const file = item.getAsFile()
        if (file) return file
      }
      return Array.from(data.files ?? []).find((file) => file.type.startsWith("image/")) ?? null
    }
  }

  function onDragOver(event: DragEvent) {
    const transfer = event.dataTransfer
    const hasFiles = transfer?.types?.includes("Files") || Boolean(transfer?.files?.length)
    if (!hasFiles || (!enabled.value && !disabled.value)) return
    event.preventDefault()
    event.stopPropagation()
    if (!enabled.value) return
    dragging.value = true
    if (transfer) transfer.dropEffect = "copy"
  }

  function onDragLeave(event: DragEvent) {
    const bounds = containerRef.value?.getBoundingClientRect()
    if (!bounds) return

    if (event.clientX <= bounds.left || event.clientX >= bounds.right || event.clientY <= bounds.top || event.clientY >= bounds.bottom)
      dragging.value = false
  }

  function onDrop(event: DragEvent) {
    dragging.value = false

    const instance = editor.value
    const files = event.dataTransfer?.files
    if (!files?.length || (!enabled.value && !disabled.value)) return

    event.preventDefault()
    event.stopPropagation()
    if (!enabled.value || !instance) return

    const images = []
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) images.push(file)
      else toasts.error(`Only image files are supported. "${file.name}" is not an image.`)
    }
    void insertImages(images, instance)
  }

  async function insertImages(files: File[], instance: Editor) {
    const key = contentKey.value
    const canInsert = () => editor.value === instance && !instance.isDestroyed && enabled.value && !isReadonly.value && key === contentKey.value

    for (const file of files) {
      if (!canInsert()) return
      const markdown = await uploadImageFile(file)
      if (!canInsert()) return
      if (!markdown) continue

      if (isLiteralTextBlock(instance)) {
        instance.view.dispatch(instance.state.tr.insertText(markdown))
        instance.commands.focus()
        continue
      }

      const doc = instance.markdown?.parse(markdown)
      const image = doc?.content?.find((node) => node.type === "image") ?? doc?.content?.[0]?.content?.find((node) => node.type === "image")
      if (!image) continue

      instance.chain().focus().insertContent(image).run()
    }
  }

  return {isDraggingOver}
}

function isLiteralTextBlock(editor: Editor) {
  return editor.state.selection.$from.parent.type.spec.code === true
}
