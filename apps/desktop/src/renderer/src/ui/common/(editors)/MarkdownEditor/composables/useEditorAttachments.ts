import {computed, ref, toValue} from "vue"
import {useEventListener} from "@vueuse/core"

import {toasts} from "@/composables/useToasts"
import {uploadImageFile} from "../utils/uploadImageFile"

import type {Task} from "@daily/protocol"
import type {Editor} from "@tiptap/vue-3"
import type {MaybeRefOrGetter} from "vue"

type AttachmentOptions = {
  enabled: MaybeRefOrGetter<boolean>
  disabled: MaybeRefOrGetter<boolean>
  readonly: MaybeRefOrGetter<boolean>
  contentKey: MaybeRefOrGetter<Task["id"] | undefined>
}

export function useEditorAttachments(
  containerRef: MaybeRefOrGetter<HTMLElement | null>,
  editor: MaybeRefOrGetter<Editor | null>,
  {enabled, disabled, readonly: isReadonly, contentKey}: AttachmentOptions,
) {
  const dragging = ref(false)

  const isDraggingOver = computed(() => dragging.value && toValue(enabled) && !toValue(isReadonly))

  useEventListener(containerRef, ["dragenter", "dragover", "drop", "paste"], blockReadonlyInteraction, {capture: true})
  useEventListener(containerRef, "paste", onPaste, {capture: true})
  useEventListener(containerRef, "dragover", onDragOver, {capture: true})
  useEventListener(containerRef, "dragleave", onDragLeave)
  useEventListener(containerRef, "drop", onDrop, {capture: true})

  function blockReadonlyInteraction(event: Event) {
    if (!toValue(isReadonly)) return
    dragging.value = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onPaste(event: ClipboardEvent) {
    const clipboard = event.clipboardData
    const instance = toValue(editor)
    if (!clipboard || !instance) return

    event.preventDefault()
    event.stopPropagation()

    const text = clipboard.getData("text/plain")
    if (toValue(enabled)) {
      const image = getClipboardImage(clipboard)
      if (event.isTrusted && image?.type !== "image/gif" && (image || !text)) {
        void pasteNativeGif(instance, image)
        return
      }
      if (image) {
        void insertImages([image], instance)
        return
      }
    }

    if (!text) return

    const blocks = text.trim() && !isLiteralTextBlock(instance) ? (instance.markdown?.parse(text).content ?? null) : null
    if (!blocks?.length) {
      instance.view.dispatch(instance.state.tr.insertText(text))
      return
    }

    const [first] = blocks
    const content = blocks.length === 1 && first.type === "paragraph" && first.content?.length ? first.content : blocks
    instance.commands.insertContent(content)

    function getClipboardImage(data: DataTransfer) {
      const files = Array.from(data.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .concat(Array.from(data.files ?? []))

      return files.find((file) => file?.type === "image/gif") ?? files.find((file) => file?.type.startsWith("image/")) ?? null
    }
  }

  async function pasteNativeGif(instance: Editor, fallback: File | null) {
    const key = toValue(contentKey)
    const bytes = await window.BridgeIPC["clipboard:read-gif"]().catch(() => null)
    if (key !== toValue(contentKey)) return

    const image = bytes ? new File([bytes], "pasted.gif", {type: "image/gif"}) : fallback
    if (image) await insertImages([image], instance)
  }

  function onDragOver(event: DragEvent) {
    const transfer = event.dataTransfer
    const hasFiles = transfer?.types?.includes("Files") || Boolean(transfer?.files?.length)
    if (!hasFiles || (!toValue(enabled) && !toValue(disabled))) return
    event.preventDefault()
    event.stopPropagation()
    if (!toValue(enabled)) return
    dragging.value = true
    if (transfer) transfer.dropEffect = "copy"
  }

  function onDragLeave(event: DragEvent) {
    const bounds = toValue(containerRef)?.getBoundingClientRect()
    if (!bounds) return

    if (event.clientX <= bounds.left || event.clientX >= bounds.right || event.clientY <= bounds.top || event.clientY >= bounds.bottom)
      dragging.value = false
  }

  function onDrop(event: DragEvent) {
    dragging.value = false

    const instance = toValue(editor)
    const files = event.dataTransfer?.files
    if (!files?.length || (!toValue(enabled) && !toValue(disabled))) return

    event.preventDefault()
    event.stopPropagation()
    if (!toValue(enabled) || !instance) return

    const images = []
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) images.push(file)
      else toasts.error(`Only image files are supported. "${file.name}" is not an image.`)
    }
    void insertImages(images, instance)
  }

  async function insertImages(files: File[], instance: Editor) {
    const key = toValue(contentKey)
    const canInsert = () =>
      toValue(editor) === instance && !instance.isDestroyed && toValue(enabled) && !toValue(isReadonly) && key === toValue(contentKey)

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
